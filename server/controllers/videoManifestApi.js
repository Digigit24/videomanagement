import { Readable } from "stream";
import fs from "fs";
import os from "os";
import path from "path";
import multer from "multer";
import yauzl from "yauzl";
import { pipeline } from "stream/promises";
import {
  createAnalysisRun,
  createSignedRawUrl,
  getExternalFolder,
  getAnalysisRuns,
  getDownloadStream,
  getFolderManifest,
  listExternalVideoFolders,
  updateApprovedMetadata,
} from "../services/videoManifestApi.js";
import { createVideo } from "../services/video.js";
import { uploadFileToS3 } from "../services/upload.js";
import processingQueue from "../services/processingQueue.js";
import { resolveBucket } from "../services/storage.js";
import { getPool } from "../db/index.js";
import { apiError } from "../utils/logger.js";

const API_UPLOAD_TEMP_DIR = path.join(os.tmpdir(), "video-api-uploads");
const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024 * 1024;
const MAX_ZIP_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;
const MAX_ZIP_EXTRACTED_BYTES = 50 * 1024 * 1024 * 1024;
const MAX_ZIP_MEDIA_FILES = 500;

const VIDEO_TYPES_BY_EXT = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".flv": "video/x-flv",
  ".wmv": "video/x-ms-wmv",
  ".3gp": "video/3gpp",
};

const IMAGE_TYPES_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

try {
  fs.mkdirSync(API_UPLOAD_TEMP_DIR, { recursive: true });
} catch (err) {
  console.error("Failed to create API upload temp dir:", err.message);
}

function makeUpload(fieldName, maxBytes, isAllowedFile) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        fs.mkdirSync(API_UPLOAD_TEMP_DIR, { recursive: true });
        cb(null, API_UPLOAD_TEMP_DIR);
      },
      filename: (_req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`);
      },
    }),
    limits: { fileSize: maxBytes },
    fileFilter: (_req, file, cb) => {
      if (!isAllowedFile(file)) {
        cb(new Error("Unsupported file type"));
        return;
      }
      cb(null, true);
    },
  }).single(fieldName);
}

const videoUpload = makeUpload("video", MAX_VIDEO_UPLOAD_BYTES, (file) => {
  const ext = path.extname(file.originalname).toLowerCase();
  return (
    Boolean(VIDEO_TYPES_BY_EXT[ext]) ||
    Boolean(IMAGE_TYPES_BY_EXT[ext]) ||
    file.mimetype.startsWith("video/") ||
    file.mimetype.startsWith("image/")
  );
});

const zipUpload = makeUpload("zip", MAX_ZIP_UPLOAD_BYTES, (file) => (
  file.mimetype === "application/zip" ||
  file.mimetype === "application/x-zip-compressed" ||
  file.originalname.toLowerCase().endsWith(".zip")
));

function getBaseUrl(req) {
  // Prefer APP_URL env var — guarantees https:// on production regardless of proxy headers
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req.headers["x-forwarded-proto"]?.split(',')[0]?.trim() || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

function contentDispositionFilename(filename) {
  const safeFilename = String(filename || "video.mp4").replace(/["\r\n]/g, "_");
  return `attachment; filename="${safeFilename}"`;
}

function pipeBodyToResponse(body, res) {
  if (typeof body?.pipe === "function") {
    body.pipe(res);
    return;
  }
  if (body) {
    Readable.fromWeb(body).pipe(res);
    return;
  }
  res.end();
}

function getVideoContentType(filename, fallback = "video/mp4") {
  const ext = path.extname(filename || "").toLowerCase();
  return VIDEO_TYPES_BY_EXT[ext] || IMAGE_TYPES_BY_EXT[ext] || fallback;
}

function safeFilename(filename) {
  return path.basename(filename || "video.mp4").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn(`[VideoManifestAPI] Failed to clean up ${filePath}: ${err.message}`);
  }
}

function cleanupDir(dirPath) {
  try {
    if (dirPath && fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[VideoManifestAPI] Failed to clean up ${dirPath}: ${err.message}`);
  }
}

function isUnsafeZipEntry(entryName) {
  return (
    !entryName ||
    path.isAbsolute(entryName) ||
    entryName.includes("\\") ||
    entryName.split("/").some((part) => part === "..")
  );
}

function openZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err) reject(err);
      else resolve(zipfile);
    });
  });
}

function readNextEntry(zipfile) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      zipfile.removeListener("entry", onEntry);
      zipfile.removeListener("end", onEnd);
      zipfile.removeListener("error", onError);
    };
    const onEntry = (entry) => {
      cleanup();
      resolve(entry);
    };
    const onEnd = () => {
      cleanup();
      resolve(null);
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    zipfile.once("entry", onEntry);
    zipfile.once("end", onEnd);
    zipfile.once("error", onError);
    zipfile.readEntry();
  });
}

function openReadStream(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) reject(err);
      else resolve(stream);
    });
  });
}

async function storeExternalVideoFile({ folder, filePath, originalName, size, baseUrl }) {
  const filename = path.basename(originalName);
  const safeName = safeFilename(filename);
  const contentType = getVideoContentType(filename);
  const { bucket: physicalBucket, prefix } = resolveBucket(folder.workspace_bucket);

  const isPhoto = contentType.startsWith("image/");
  const mediaType = isPhoto ? "photo" : "video";

  const video = await createVideo({
    bucket: folder.workspace_bucket,
    filename,
    objectKey: `${prefix}pending/${Date.now()}-${safeName}`,
    size,
    uploadedBy: null,
    folderId: folder.id,
    mediaType,
  });

  const objectKey = `${prefix}videos/${video.id}/${safeName}`;
  await uploadFileToS3(physicalBucket, objectKey, filePath, contentType);
  await getPool().query(
    "UPDATE videos SET object_key = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
    [objectKey, video.id],
  );

  if (isPhoto) {
    // Photos: finalized immediately in database
    await getPool().query(
      `UPDATE videos SET hls_ready = FALSE, thumbnail_key = $1, processing_status = 'completed' WHERE id = $2`,
      [objectKey, video.id],
    );
  } else {
    // Videos: queue for processing
    await processingQueue.enqueue(video.id, filePath, folder.workspace_bucket, safeName);
  }

  const publicMediaUrl = `${baseUrl}/api/public/media/${video.id}`;

  return {
    id: video.id,
    folder_id: folder.id,
    folder_name: folder.name,
    filename,
    content_type: contentType,
    size_bytes: size,
    status: isPhoto ? "completed" : "queued",
    download_url: publicMediaUrl,
    public_raw_url: publicMediaUrl,
    signed_url_endpoint: `${baseUrl}/api/videos/${video.id}/signed-url`,
  };
}

function multerHandler(upload, req, res) {
  return new Promise((resolve, reject) => {
    upload(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function listVideoFoldersForApi(req, res) {
  try {
    const folders = await listExternalVideoFolders(getBaseUrl(req), {
      bucket: req.query.bucket || null,
      workspaceId: req.query.workspace_id || null,
    });
    res.json(folders);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to list video folders" });
  }
}

export async function getVideoFolderManifest(req, res) {
  try {
    const manifest = await getFolderManifest(req.params.folderId, getBaseUrl(req));
    if (!manifest) {
      return res.status(404).json({ error: "Folder not found" });
    }
    res.json(manifest);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to build folder manifest" });
  }
}

export async function uploadVideoToFolderForApi(req, res) {
  let uploadedPath = null;
  try {
    await multerHandler(videoUpload, req, res);
    uploadedPath = req.file?.path || null;

    if (!req.file) {
      return res.status(400).json({ error: "No video file provided. Use multipart field 'video'." });
    }

    const folder = await getExternalFolder(req.params.folderId);
    if (!folder) {
      cleanupFile(uploadedPath);
      return res.status(404).json({ error: "Folder not found" });
    }

    const video = await storeExternalVideoFile({
      folder,
      filePath: uploadedPath,
      originalName: req.file.originalname,
      size: req.file.size,
      baseUrl: getBaseUrl(req),
    });

    res.status(201).json({ video });
  } catch (error) {
    if (uploadedPath) cleanupFile(uploadedPath);
    apiError(req, error);
    const isSizeLimit = error.code === "LIMIT_FILE_SIZE";
    res.status(400).json({
      error: isSizeLimit ? "Video file must be 50GB or smaller" : error.message || "Failed to upload video",
    });
  }
}

export async function uploadZipToFolderForApi(req, res) {
  let zipPath = null;
  const extractedDir = path.join(
    API_UPLOAD_TEMP_DIR,
    `api-zip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const queuedVideoPaths = new Set();

  try {
    await multerHandler(zipUpload, req, res);
    zipPath = req.file?.path || null;

    if (!req.file) {
      return res.status(400).json({ error: "No zip file provided. Use multipart field 'zip'." });
    }

    const folder = await getExternalFolder(req.params.folderId);
    if (!folder) {
      cleanupFile(zipPath);
      return res.status(404).json({ error: "Folder not found" });
    }

    fs.mkdirSync(extractedDir, { recursive: true });
    const zipfile = await openZip(zipPath);
    const uploaded = [];
    const skipped = [];
    let mediaFileCount = 0;
    let extractedBytes = 0;

    while (true) {
      const entry = await readNextEntry(zipfile);
      if (!entry) break;

      const entryName = entry.fileName;
      if (/\/$/.test(entryName)) continue;

      if (isUnsafeZipEntry(entryName)) {
        skipped.push({ filename: entryName, reason: "Unsafe zip path" });
        continue;
      }

      if (!getVideoContentType(entryName, null)) {
        skipped.push({ filename: entryName, reason: "Unsupported file type" });
        continue;
      }

      mediaFileCount += 1;
      if (mediaFileCount > MAX_ZIP_MEDIA_FILES) {
        throw new Error(`Zip contains too many video files. Maximum is ${MAX_ZIP_MEDIA_FILES}.`);
      }

      extractedBytes += Number(entry.uncompressedSize || 0);
      if (extractedBytes > MAX_ZIP_EXTRACTED_BYTES) {
        throw new Error("Zip extracted contents are too large. Maximum extracted video size is 50GB.");
      }

      const outputPath = path.join(
        extractedDir,
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFilename(entryName)}`,
      );
      const readStream = await openReadStream(zipfile, entry);
      await pipeline(readStream, fs.createWriteStream(outputPath));

      const size = fs.statSync(outputPath).size;
      const video = await storeExternalVideoFile({
        folder,
        filePath: outputPath,
        originalName: path.basename(entryName),
        size,
        baseUrl: getBaseUrl(req),
      });
      queuedVideoPaths.add(outputPath);
      uploaded.push(video);
    }

    cleanupFile(zipPath);
    if (queuedVideoPaths.size === 0) cleanupDir(extractedDir);

    res.status(201).json({
      message: "Zip processed successfully",
      folder_id: folder.id,
      uploaded,
      skipped,
      limits: {
        zip_max_bytes: MAX_ZIP_UPLOAD_BYTES,
        extracted_max_bytes: MAX_ZIP_EXTRACTED_BYTES,
        media_file_max_count: MAX_ZIP_MEDIA_FILES,
      },
    });
  } catch (error) {
    cleanupFile(zipPath);
    try {
      if (fs.existsSync(extractedDir)) {
        for (const file of fs.readdirSync(extractedDir)) {
          const filePath = path.join(extractedDir, file);
          if (!queuedVideoPaths.has(filePath)) cleanupFile(filePath);
        }
      }
    } catch (_) {}
    if (queuedVideoPaths.size === 0) cleanupDir(extractedDir);

    apiError(req, error);
    const isSizeLimit = error.code === "LIMIT_FILE_SIZE";
    res.status(400).json({
      error: isSizeLimit ? "Zip file must be 10GB or smaller" : error.message || "Failed to upload zip",
    });
  }
}

export async function downloadExternalVideo(req, res) {
  try {
    const rangeHeader = req.headers.range || null;
    const download = await getDownloadStream(req.params.videoId, rangeHeader);

    if (!download) {
      return res.status(404).json({ error: "Video not found" });
    }

    res.status(download.contentRange ? 206 : 200);
    res.setHeader("Content-Type", download.contentType);
    res.setHeader("Content-Disposition", contentDispositionFilename(download.video.filename));
    res.setHeader("Accept-Ranges", "bytes");
    if (download.contentLength !== undefined) {
      res.setHeader("Content-Length", download.contentLength);
    }
    if (download.contentRange) {
      res.setHeader("Content-Range", download.contentRange);
    }

    pipeBodyToResponse(download.stream, res);
  } catch (error) {
    apiError(req, error);
    if (!res.headersSent) {
      res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : "Failed to download video",
        ...(error.details ? { details: error.details } : {}),
      });
    }
  }
}

export async function getSignedExternalVideoUrl(req, res) {
  try {
    const expiresIn = req.body?.expires_in_seconds;
    const signed = await createSignedRawUrl(req.params.videoId, expiresIn);
    if (!signed) {
      return res.status(404).json({ error: "Video not found" });
    }
    res.json(signed);
  } catch (error) {
    apiError(req, error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Failed to create signed URL",
      ...(error.details ? { details: error.details } : {}),
    });
  }
}

export async function postVideoAnalysisRun(req, res) {
  try {
    const run = await createAnalysisRun(req.params.videoId, req.body || {});
    if (!run) {
      return res.status(404).json({ error: "Video not found" });
    }
    res.status(201).json({
      analysis_run_id: run.id,
      video_id: run.video_id,
      status: "stored",
    });
  } catch (error) {
    apiError(req, error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Failed to store analysis run",
    });
  }
}

export async function listVideoAnalysisRuns(req, res) {
  try {
    const result = await getAnalysisRuns(req.params.videoId);
    if (!result) {
      return res.status(404).json({ error: "Video not found" });
    }
    res.json(result);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to fetch analysis runs" });
  }
}

export async function patchApprovedVideoMetadata(req, res) {
  try {
    const metadata = await updateApprovedMetadata(req.params.videoId, req.body || {});
    if (!metadata) {
      return res.status(404).json({ error: "Video not found" });
    }
    res.json({
      video_id: metadata.video_id,
      labels: metadata.labels,
      scenes: metadata.scenes,
      transcript_summary: metadata.transcript_summary,
      updated_at: metadata.updated_at,
    });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update approved metadata" });
  }
}

export async function createVideoFolderForApi(req, res) {
  try {
    const { name, bucket } = req.body;
    if (!name || !bucket) {
      return res.status(400).json({ error: "name and bucket are required" });
    }
    
    // Find workspace by bucket
    const workspaceResult = await getPool().query(
      "SELECT id FROM workspaces WHERE bucket = $1",
      [bucket]
    );
    if (workspaceResult.rows.length === 0) {
      return res.status(404).json({ error: "Workspace with this bucket not found" });
    }
    const workspaceId = workspaceResult.rows[0].id;
    
    // Insert folder
    const folderResult = await getPool().query(
      `INSERT INTO folders (workspace_id, name)
       VALUES ($1, $2)
       RETURNING id, name, workspace_id, created_at, updated_at`,
      [workspaceId, name]
    );
    
    res.status(201).json({ folder: folderResult.rows[0] });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to create folder" });
  }
}
