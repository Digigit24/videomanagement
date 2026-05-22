import {
  createFolder,
  getFolders,
  getFolderById,
  updateFolder,
  deleteFolder,
} from "../services/folder.js";
import { getWorkspaceById } from "../services/workspace.js";
import { checkPermission } from "../services/permissions.js";
import { apiError } from "../utils/logger.js";
import archiver from "archiver";
import { getPool } from "../db/index.js";
import { getObjectStream, resolveBucket } from "../services/storage.js";
import { uploadFileToS3 } from "../services/upload.js";
import { createVideo } from "../services/video.js";
import processingQueue from "../services/processingQueue.js";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import multer from "multer";
import yauzl from "yauzl";
import { pipeline } from "stream/promises";

const ZIP_UPLOAD_MAX_BYTES = 10 * 1024 * 1024 * 1024;
const ZIP_MAX_EXTRACTED_BYTES = 50 * 1024 * 1024 * 1024;
const ZIP_MAX_MEDIA_FILES = 500;
const ZIP_TEMP_DIR = path.join(os.tmpdir(), "video-zip-uploads");

const MEDIA_TYPES_BY_EXT = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".flv": "video/x-flv",
  ".wmv": "video/x-ms-wmv",
  ".3gp": "video/3gpp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".svg": "image/svg+xml",
};

try {
  fs.mkdirSync(ZIP_TEMP_DIR, { recursive: true });
} catch (err) {
  console.error("Failed to create zip upload temp dir:", err.message);
}

const zipUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(ZIP_TEMP_DIR, { recursive: true });
      cb(null, ZIP_TEMP_DIR);
    },
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`);
    },
  }),
  limits: { fileSize: ZIP_UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const isZip =
      file.mimetype === "application/zip" ||
      file.mimetype === "application/x-zip-compressed" ||
      file.originalname.toLowerCase().endsWith(".zip");
    if (!isZip) {
      cb(new Error("Only .zip files are supported for zip uploads"));
      return;
    }
    cb(null, true);
  },
}).single("zip");

function getMediaType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const contentType = MEDIA_TYPES_BY_EXT[ext];
  if (!contentType) return null;
  return {
    contentType,
    mediaType: contentType.startsWith("image/") ? "photo" : "video",
  };
}

function isUnsafeZipEntry(entryName) {
  return (
    !entryName ||
    path.isAbsolute(entryName) ||
    entryName.includes("\\") ||
    entryName.split("/").some((part) => part === "..")
  );
}

function safeBasename(entryName) {
  return path.basename(entryName).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn(`[ZipUpload] Failed to clean up ${filePath}: ${err.message}`);
  }
}

function cleanupEmptyDir(dirPath) {
  try {
    if (dirPath && fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[ZipUpload] Failed to clean up ${dirPath}: ${err.message}`);
  }
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

export async function listFolders(req, res) {
  try {
    const { workspaceId } = req.params;
    const folders = await getFolders(workspaceId);
    res.json({ folders });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to list folders" });
  }
}

export async function createNewFolder(req, res) {
  try {
    const { workspaceId } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Folder name is required" });
    }

    // Check permission
    const canCreate = await checkPermission(workspaceId, req.user.id, "can_create_folder");
    if (!canCreate) {
      return res.status(403).json({ error: "You do not have permission to create folders in this workspace" });
    }

    const folder = await createFolder(workspaceId, name, req.user.id);
    res.status(201).json({ folder });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to create folder" });
  }
}

export async function updateFolderName(req, res) {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Folder name is required" });
    }

    const folder = await getFolderById(id);
    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    const updated = await updateFolder(id, name);
    res.json({ folder: updated });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update folder" });
  }
}

export async function removeFolder(req, res) {
  try {
    const { id } = req.params;

    const folder = await getFolderById(id);
    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    // Check permission
    const canDelete = await checkPermission(folder.workspace_id, req.user.id, "can_delete_folder");
    if (!canDelete) {
      return res.status(403).json({ error: "You do not have permission to delete folders" });
    }

    await deleteFolder(id);
    res.json({ message: "Folder deleted" });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to delete folder" });
  }
}

export async function uploadZipToFolder(req, res) {
  zipUpload(req, res, async (err) => {
    const uploadedZipPath = req.file?.path;
    const extractedDir = path.join(
      ZIP_TEMP_DIR,
      `extract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    const queuedVideoPaths = new Set();

    if (err) {
      cleanupFile(uploadedZipPath);
      const isSizeLimit = err.code === "LIMIT_FILE_SIZE";
      return res.status(400).json({
        error: isSizeLimit ? "Zip file must be 10GB or smaller" : err.message,
      });
    }

    try {
      const { folderId } = req.params;
      const folder = await getFolderById(folderId);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No zip file provided" });
      }

      const allowedRoles = [
        "admin",
        "video_editor",
        "project_manager",
        "social_media_manager",
        "client",
        "member",
        "videographer",
        "photo_editor",
      ];
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ error: "You do not have permission to upload" });
      }

      fs.mkdirSync(extractedDir, { recursive: true });

      const zipfile = await openZip(req.file.path);
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

        const mediaInfo = getMediaType(entryName);
        if (!mediaInfo) {
          skipped.push({ filename: entryName, reason: "Unsupported file type" });
          continue;
        }

        mediaFileCount += 1;
        if (mediaFileCount > ZIP_MAX_MEDIA_FILES) {
          throw new Error(`Zip contains too many media files. Maximum is ${ZIP_MAX_MEDIA_FILES}.`);
        }

        const uncompressedSize = Number(entry.uncompressedSize || 0);
        extractedBytes += uncompressedSize;
        if (extractedBytes > ZIP_MAX_EXTRACTED_BYTES) {
          throw new Error("Zip extracted contents are too large. Maximum extracted media size is 50GB.");
        }

        const originalName = path.basename(entryName);
        const safeName = safeBasename(originalName);
        const localPath = path.join(
          extractedDir,
          `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`,
        );

        const readStream = await openReadStream(zipfile, entry);
        await pipeline(readStream, fs.createWriteStream(localPath));

        const actualSize = fs.statSync(localPath).size;
        const { bucket: resolvedBucket, prefix } = resolveBucket(folder.workspace_bucket);
        const initialObjectKey = `${prefix}${Date.now()}-${safeName}`;

        const video = await createVideo({
          bucket: folder.workspace_bucket,
          filename: originalName,
          objectKey: initialObjectKey,
          size: actualSize,
          uploadedBy: req.user.id,
          folderId,
          mediaType: mediaInfo.mediaType,
        });

        if (mediaInfo.mediaType === "photo") {
          try {
            await uploadFileToS3(resolvedBucket, initialObjectKey, localPath, mediaInfo.contentType);
            await getPool().query(
              `UPDATE videos
               SET object_key = $1,
                   hls_ready = FALSE,
                   thumbnail_key = $1,
                   processing_status = 'completed',
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [initialObjectKey, video.id],
            );
          } finally {
            cleanupFile(localPath);
          }
        } else {
          await uploadFileToS3(resolvedBucket, initialObjectKey, localPath, mediaInfo.contentType);
          await getPool().query(
            "UPDATE videos SET object_key = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
            [initialObjectKey, video.id],
          );
          queuedVideoPaths.add(localPath);
          await processingQueue.enqueue(video.id, localPath, folder.workspace_bucket, safeName);
        }

        uploaded.push({
          id: video.id,
          filename: originalName,
          media_type: mediaInfo.mediaType,
          size: actualSize,
          status: mediaInfo.mediaType === "video" ? "queued" : "uploaded",
        });
      }

      cleanupFile(req.file.path);
      if (queuedVideoPaths.size === 0) {
        cleanupEmptyDir(extractedDir);
      }

      res.status(201).json({
        message: "Zip processed successfully",
        uploaded,
        skipped,
        limits: {
          zip_max_bytes: ZIP_UPLOAD_MAX_BYTES,
          extracted_max_bytes: ZIP_MAX_EXTRACTED_BYTES,
          media_file_max_count: ZIP_MAX_MEDIA_FILES,
        },
      });
    } catch (error) {
      apiError(req, error);
      cleanupFile(uploadedZipPath);
      try {
        if (fs.existsSync(extractedDir)) {
          for (const file of fs.readdirSync(extractedDir)) {
            const filePath = path.join(extractedDir, file);
            if (!queuedVideoPaths.has(filePath)) cleanupFile(filePath);
          }
        }
      } catch (_) {}
      if (queuedVideoPaths.size === 0) {
        cleanupEmptyDir(extractedDir);
      }
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Failed to process zip upload" });
      }
    }
  });
}

// Helper: deduplicate filenames inside a zip
function deduplicateFilename(name, usedNames) {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  const ext = name.includes(".") ? "." + name.split(".").pop() : "";
  const base = ext ? name.slice(0, -ext.length) : name;
  let counter = 1;
  let candidate;
  do {
    candidate = `${base}_${counter}${ext}`;
    counter++;
  } while (usedNames.has(candidate));
  usedNames.add(candidate);
  return candidate;
}

// Helper: pipe a single file from S3 into an archiver zip
// Note: getObjectStream already calls resolveBucket internally, so pass the workspace bucket directly
async function appendFileToArchive(archive, bucketName, objectKey, filename) {
  const stream = await getObjectStream(bucketName, objectKey);
  archive.append(stream, { name: filename });
}

// Download an entire folder as a zip
export async function downloadFolder(req, res) {
  try {
    const { folderId } = req.params;
    const pool = getPool();

    // Get folder info
    const folderResult = await pool.query(
      `SELECT f.*, w.bucket as workspace_bucket FROM folders f JOIN workspaces w ON f.workspace_id = w.id WHERE f.id = $1`,
      [folderId],
    );
    const folder = folderResult.rows[0];
    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    // Get all active files in this folder
    const videosResult = await pool.query(
      `SELECT id, filename, object_key, bucket, media_type, size FROM videos WHERE folder_id = $1 AND is_active_version = TRUE ORDER BY created_at`,
      [folderId],
    );
    const files = videosResult.rows;

    if (files.length === 0) {
      return res.status(400).json({ error: "Folder is empty — nothing to download" });
    }

    const safeFolderName = folder.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFolderName}.zip"`);

    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.on("error", (err) => {
      console.error("[FolderDownload] Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create zip" });
      }
    });
    archive.pipe(res);

    const usedNames = new Set();
    for (const file of files) {
      const fname = deduplicateFilename(file.filename, usedNames);
      try {
        await appendFileToArchive(archive, file.bucket, file.object_key, fname);
      } catch (err) {
        console.warn(`[FolderDownload] Skipping file ${file.id} (${file.filename}): ${err.message}`);
      }
    }

    await archive.finalize();
  } catch (error) {
    apiError(req, error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to download folder" });
    }
  }
}

// Download selected files as a zip (POST with { videoIds: [...] })
export async function downloadBulk(req, res) {
  try {
    const { videoIds } = req.body;

    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ error: "No files selected" });
    }

    if (videoIds.length > 500) {
      return res.status(400).json({ error: "Too many files selected (max 500)" });
    }

    const pool = getPool();
    const placeholders = videoIds.map((_, i) => `$${i + 1}`).join(",");
    const result = await pool.query(
      `SELECT id, filename, object_key, bucket, media_type, size FROM videos WHERE id IN (${placeholders}) AND is_active_version = TRUE ORDER BY created_at`,
      videoIds,
    );
    const files = result.rows;

    if (files.length === 0) {
      return res.status(400).json({ error: "No valid files found" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="selected-files.zip"`);

    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.on("error", (err) => {
      console.error("[BulkDownload] Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create zip" });
      }
    });
    archive.pipe(res);

    const usedNames = new Set();
    for (const file of files) {
      const fname = deduplicateFilename(file.filename, usedNames);
      try {
        await appendFileToArchive(archive, file.bucket, file.object_key, fname);
      } catch (err) {
        console.warn(`[BulkDownload] Skipping file ${file.id} (${file.filename}): ${err.message}`);
      }
    }

    await archive.finalize();
  } catch (error) {
    apiError(req, error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to download files" });
    }
  }
}

// Download multiple folders as a single zip (POST with { folderIds: [...] })
export async function downloadBulkFolders(req, res) {
  try {
    const { folderIds } = req.body;

    if (!folderIds || !Array.isArray(folderIds) || folderIds.length === 0) {
      return res.status(400).json({ error: "No folders selected" });
    }

    const pool = getPool();

    // Get folder info
    const folderPlaceholders = folderIds.map((_, i) => `$${i + 1}`).join(",");
    const foldersResult = await pool.query(
      `SELECT f.id, f.name FROM folders f WHERE f.id IN (${folderPlaceholders})`,
      folderIds,
    );
    const folderMap = new Map(foldersResult.rows.map(f => [f.id, f.name]));

    if (folderMap.size === 0) {
      return res.status(400).json({ error: "No valid folders found" });
    }

    // Get all files across these folders
    const filesResult = await pool.query(
      `SELECT id, filename, object_key, bucket, media_type, folder_id FROM videos WHERE folder_id IN (${folderPlaceholders}) AND is_active_version = TRUE ORDER BY folder_id, created_at`,
      folderIds,
    );
    const files = filesResult.rows;

    if (files.length === 0) {
      return res.status(400).json({ error: "Selected folders are empty — nothing to download" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="folders.zip"`);

    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.on("error", (err) => {
      console.error("[BulkFolderDownload] Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create zip" });
      }
    });
    archive.pipe(res);

    // Track used names per folder subdirectory
    const folderUsedNames = new Map();
    for (const file of files) {
      const folderName = (folderMap.get(file.folder_id) || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_");
      if (!folderUsedNames.has(folderName)) {
        folderUsedNames.set(folderName, new Set());
      }
      const usedNames = folderUsedNames.get(folderName);
      const fname = deduplicateFilename(file.filename, usedNames);
      try {
        const stream = await getObjectStream(file.bucket, file.object_key);
        archive.append(stream, { name: `${folderName}/${fname}` });
      } catch (err) {
        console.warn(`[BulkFolderDownload] Skipping file ${file.id}: ${err.message}`);
      }
    }

    await archive.finalize();
  } catch (error) {
    apiError(req, error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to download folders" });
    }
  }
}

// === Folder Share Tokens ===

export async function createFolderShareToken(req, res) {
  try {
    const { folderId } = req.params;
    const { requireLogin } = req.body;
    const pool = getPool();

    const folder = await getFolderById(folderId);
    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    // Check for existing active token
    const existing = await pool.query(
      `SELECT * FROM folder_share_tokens WHERE folder_id = $1 AND active = true LIMIT 1`,
      [folderId],
    );

    if (existing.rows[0]) {
      // Update require_login if changed
      if (existing.rows[0].require_login !== !!requireLogin) {
        await pool.query(
          `UPDATE folder_share_tokens SET require_login = $1, updated_at = NOW() WHERE id = $2`,
          [!!requireLogin, existing.rows[0].id],
        );
        existing.rows[0].require_login = !!requireLogin;
      }
      return res.json({ token: existing.rows[0].token, folderId, requireLogin: existing.rows[0].require_login });
    }

    const token = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `INSERT INTO folder_share_tokens (folder_id, token, created_by, require_login) VALUES ($1, $2, $3, $4)`,
      [folderId, token, req.user.id, !!requireLogin],
    );

    res.json({ token, folderId, requireLogin: !!requireLogin });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to create share token" });
  }
}

// Public: get folder info + videos via share token
export async function getSharedFolder(req, res) {
  try {
    const { token } = req.params;
    const pool = getPool();

    const tokenResult = await pool.query(
      `SELECT fst.*, f.name as folder_name, f.workspace_id
       FROM folder_share_tokens fst
       JOIN folders f ON fst.folder_id = f.id
       WHERE fst.token = $1 AND fst.active = true`,
      [token],
    );

    if (!tokenResult.rows[0]) {
      return res.status(404).json({ error: "Invalid or expired share link" });
    }

    const shareData = tokenResult.rows[0];

    // Get videos in the folder
    const videosResult = await pool.query(
      `SELECT id, filename, media_type, size, status, hls_ready, created_at, thumbnail_key
       FROM videos WHERE folder_id = $1 AND is_active_version = TRUE ORDER BY created_at DESC`,
      [shareData.folder_id],
    );

    res.json({
      folder: {
        id: shareData.folder_id,
        name: shareData.folder_name,
      },
      videos: videosResult.rows,
      requireLogin: shareData.require_login,
    });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to load shared folder" });
  }
}

// Public: download an entire shared folder as a zip via share token
export async function downloadSharedFolder(req, res) {
  try {
    const { token } = req.params;
    const pool = getPool();

    // Resolve folder by active share token
    const tokenResult = await pool.query(
      `SELECT fst.folder_id, f.name as folder_name
       FROM folder_share_tokens fst
       JOIN folders f ON fst.folder_id = f.id
       WHERE fst.token = $1 AND fst.active = true`,
      [token],
    );

    if (!tokenResult.rows[0]) {
      return res.status(404).json({ error: "Invalid or expired share link" });
    }

    const { folder_id: folderId, folder_name: folderName } = tokenResult.rows[0];

    const videosResult = await pool.query(
      `SELECT id, filename, object_key, bucket, media_type, size
       FROM videos WHERE folder_id = $1 AND is_active_version = TRUE ORDER BY created_at`,
      [folderId],
    );
    const files = videosResult.rows;

    if (files.length === 0) {
      return res.status(400).json({ error: "Folder is empty — nothing to download" });
    }

    const safeFolderName = (folderName || "folder").replace(/[^a-zA-Z0-9._-]/g, "_");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFolderName}.zip"`);

    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.on("error", (err) => {
      console.error("[SharedFolderDownload] Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create zip" });
      }
    });
    archive.pipe(res);

    const usedNames = new Set();
    for (const file of files) {
      const fname = deduplicateFilename(file.filename, usedNames);
      try {
        await appendFileToArchive(archive, file.bucket, file.object_key, fname);
      } catch (err) {
        console.warn(`[SharedFolderDownload] Skipping file ${file.id} (${file.filename}): ${err.message}`);
      }
    }

    await archive.finalize();
  } catch (error) {
    apiError(req, error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to download folder" });
    }
  }
}

// Get all video IDs in given folders (for "download original" of folders)
export async function getFolderFileIds(req, res) {
  try {
    const { folderIds } = req.body;

    if (!folderIds || !Array.isArray(folderIds) || folderIds.length === 0) {
      return res.status(400).json({ error: "No folders selected" });
    }

    const pool = getPool();
    const placeholders = folderIds.map((_, i) => `$${i + 1}`).join(",");
    const result = await pool.query(
      `SELECT id, bucket FROM videos WHERE folder_id IN (${placeholders}) AND is_active_version = TRUE ORDER BY created_at`,
      folderIds,
    );

    res.json({ files: result.rows });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get folder files" });
  }
}
