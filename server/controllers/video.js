import multer from "multer";
import fs from "fs";
import path from "path";
import os from "os";
import { VALID_VIDEO_STATUSES } from "../utils/constants.js";
import {
  getVideos,
  getVideoById,
  updateVideoStatus,
  createVideo,
  getVideoVersions,
  getDeletedVideos,
  restoreDeletedVideo,
  deleteVideo,
  permanentlyDeleteVideo,
} from "../services/video.js";
import { getVideoStream, getVideoStreamWithMeta, resolveBucket } from "../services/storage.js";
import { uploadFileToS3 } from "../services/upload.js";
import processingQueue from "../services/processingQueue.js";
import { apiError } from "../utils/logger.js";
import { notifyWorkspaceMembers } from "../services/notification.js";
import { getWorkspaceByBucket } from "../services/workspace.js";

// Store uploaded files in a dedicated temp directory on the server
const UPLOAD_TEMP_DIR = path.join(os.tmpdir(), "video-uploads");
try {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
} catch (err) {
  console.error("Failed to create upload temp dir:", err.message);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
      cb(null, UPLOAD_TEMP_DIR);
    },
    filename: (req, file, cb) => {
      // Use timestamp + random suffix to avoid collisions
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 * 1024 }, // 50GB
  fileFilter: (req, file, cb) => {
    const allowedVideoTypes = [
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-msvideo",
      "video/x-matroska",
      "video/x-flv",
      "video/x-ms-wmv",
      "video/3gpp",
    ];
    const allowedImageTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/bmp",
      "image/tiff",
      "image/svg+xml",
    ];
    if (
      allowedVideoTypes.includes(file.mimetype) ||
      allowedImageTypes.includes(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Supported: MP4, MOV, WebM, AVI, MKV, JPG, PNG, GIF, WebP, BMP, TIFF, SVG",
        ),
      );
    }
  },
});

export const uploadMiddleware = upload.single("video");

export async function listVideos(req, res) {
  try {
    const rawPage = parseInt(req.query.page);
    const rawLimit = parseInt(req.query.limit);
    const page = rawPage > 0 ? rawPage : undefined;
    const limit = rawLimit > 0 ? Math.min(rawLimit, 500) : undefined;

    const result = await getVideos(req.bucket, { page, limit });

    // Paginated response includes metadata; unpaginated returns plain array
    if (limit) {
      res.json(result);
    } else {
      res.json({ videos: result });
    }
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to list videos" });
  }
}

export async function getVideo(req, res) {
  try {
    const { id } = req.params;
    const video = await getVideoById(id, req.bucket);

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    res.json({ video });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get video" });
  }
}

export async function updateStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userRole = req.user.role;

    if (!status || !VALID_VIDEO_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_VIDEO_STATUSES.join(", ")}` });
    }

    // Only admin, project_manager, and client can change video status
    const statusChangeRoles = ["admin", "project_manager", "client"];
    if (!statusChangeRoles.includes(userRole)) {
      return res.status(403).json({
        error: "Only admin, project manager, or client can change video status",
      });
    }

    const video = await updateVideoStatus(id, status, req.user.id);

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Send notification to ALL workspace members
    try {
      const workspace = await getWorkspaceByBucket(video.bucket);
      if (workspace) {
        const userName = req.user.name || req.user.email;
        await notifyWorkspaceMembers(
          workspace.id,
          req.user.id,
          "status_changed",
          `Video ${status} — ${workspace.client_name}`,
          `${userName} changed "${video.filename}" to ${status} in ${workspace.client_name}`,
          "video",
          video.id,
        );
      }
    } catch (e) {
      console.error("Notification error:", e);
    }

    res.json({ video });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: error.message || "Failed to update status" });
  }
}

export async function uploadVideo(req, res) {
  uploadMiddleware(req, res, async (err) => {
    if (err) {
      apiError(req, err);
      return res.status(400).json({ error: err.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      // All workspace members can upload
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
        return res
          .status(403)
          .json({ error: "You do not have permission to upload" });
      }

      const { originalname, path: filePath, size, mimetype } = req.file;
      const { bucket: resolvedBucket, prefix } = resolveBucket(req.bucket);
      const replaceVideoId = req.body.replaceVideoId || null;
      const folderId = req.body.folderId || null;

      // Auto-detect media type from mimetype
      const isPhoto = mimetype.startsWith("image/");
      const mediaType = isPhoto ? "photo" : "video";

      // Sanitize filename
      const safeName = originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const timestamp = Date.now();
      const objectKey = `${prefix}${timestamp}-${safeName}`;

      console.log(
        `[Upload] ${mediaType} received: filename=${safeName}, size=${(size / 1024 / 1024).toFixed(1)}MB, localPath=${filePath}`,
      );

      // Step 1: Create record in database (immediately, before S3 upload)
      const video = await createVideo({
        bucket: req.bucket,
        filename: originalname,
        objectKey,
        size,
        uploadedBy: req.user.id,
        replaceVideoId,
        folderId,
        mediaType,
      });

      // Send notification
      try {
        const workspace = await getWorkspaceByBucket(req.bucket);
        if (workspace) {
          const userName = req.user.name || req.user.email;
          const typeLabel = isPhoto ? "Photo" : "Video";
          await notifyWorkspaceMembers(
            workspace.id,
            req.user.id,
            "video_uploaded",
            `New ${typeLabel} — ${workspace.client_name}`,
            `${userName} uploaded "${originalname}" to ${workspace.client_name}`,
            "video",
            video.id,
          );
        }
      } catch (e) {
        console.error("Notification error:", e);
      }

      // Step 2: Handle differently for photos vs videos
      if (isPhoto) {
        // Photos: Upload to S3 immediately, then delete local file
        try {
          await uploadFileToS3(resolvedBucket, objectKey, filePath, mimetype);
          const pool = (await import("../db/index.js")).getPool();
          await pool.query(
            `UPDATE videos SET object_key = $1, hls_ready = FALSE, thumbnail_key = $1, processing_status = 'completed' WHERE id = $2`,
            [objectKey, video.id],
          );
          console.log(`[Upload] Photo uploaded to S3 and finalized: ${objectKey}`);
        } catch (photoErr) {
          console.error("Photo upload error:", photoErr);
        }
        // Delete local temp file
        try { fs.unlinkSync(filePath); } catch (e) { console.error("Failed to clean up temp file:", e.message); }
      } else {
        // Videos: Keep the file on server, enqueue for local processing
        // The processing queue will process from the local file, upload results to S3,
        // then delete the local file when done.
        processingQueue
          .enqueue(video.id, filePath, req.bucket, safeName)
          .catch((err) => {
            console.error(`Failed to enqueue video ${video.id}:`, err.message);
          });
      }

      res.status(201).json({
        video: { ...video, media_type: mediaType },
        message: isPhoto
          ? "Photo uploaded successfully."
          : "Video uploaded. Processing will start shortly.",
      });
    } catch (error) {
      apiError(req, error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to upload" });
      }
    }
  });
}

// Get version history for a video
export async function getVersionHistory(req, res) {
  try {
    const { id } = req.params;
    const video = await getVideoById(id, req.bucket);

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    const versions = await getVideoVersions(video.version_group_id, req.bucket);
    res.json({ versions, currentVersionId: video.id });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get version history" });
  }
}

// Get deleted videos (backup)
export async function listDeletedVideos(req, res) {
  try {
    const deleted = await getDeletedVideos(req.bucket);
    res.json({ deleted });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get deleted videos" });
  }
}

// Permanently delete a video from recycle bin
export async function permanentDeleteVideo(req, res) {
  try {
    const { id } = req.params;

    // Only admin can permanently delete
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Only admins can permanently delete videos" });
    }

    await permanentlyDeleteVideo(id);
    res.json({ message: "Video permanently deleted" });
  } catch (error) {
    apiError(req, error);
    res
      .status(500)
      .json({ error: error.message || "Failed to permanently delete video" });
  }
}

// Restore a deleted video
export async function restoreVideo(req, res) {
  try {
    const { id } = req.params;
    await restoreDeletedVideo(id);
    res.json({ message: "Video restored successfully" });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: error.message || "Failed to restore video" });
  }
}

// Download video or photo
export async function downloadVideo(req, res) {
  try {
    const { id } = req.params;
    const video = await getVideoById(id, req.bucket);

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Photos: serve the original file directly from S3
    if (video.media_type === "photo") {
      const { getObjectStream } = await import("../services/storage.js");
      const objectKey = video.object_key;

      try {
        // getObjectStream already calls resolveBucket internally
        const stream = await getObjectStream(video.bucket, objectKey);
        const ext = video.filename.split(".").pop()?.toLowerCase() || "jpg";
        const contentTypes = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          gif: "image/gif",
          webp: "image/webp",
          bmp: "image/bmp",
          tiff: "image/tiff",
          svg: "image/svg+xml",
        };
        res.setHeader("Content-Type", contentTypes[ext] || "image/jpeg");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${video.filename}"`,
        );
        stream.pipe(res);
      } catch (streamErr) {
        console.error("Photo download error:", streamErr);
        return res.status(404).json({ error: "Photo file not found" });
      }
      return;
    }

    // Video download: Try to serve original file first (Highest Quality / MP4)
    try {
      const stream = await getVideoStream(req.bucket, video.object_key);
      const ext = video.filename.split(".").pop().toLowerCase();
      const mimeTypes = {
        mp4: "video/mp4",
        mov: "video/quicktime",
        webm: "video/webm",
        avi: "video/x-msvideo",
        mkv: "video/x-matroska",
        wmv: "video/x-ms-wmv",
        flv: "video/x-flv",
      };

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${video.filename}"`,
      );
      res.setHeader(
        "Content-Type",
        mimeTypes[ext] || "application/octet-stream",
      );
      stream.pipe(res);
      return;
    } catch (originalErr) {
      console.warn(
        `[Download] Original file not found for video ${video.id} (key: ${video.object_key}), falling back to HLS.`,
      );
    }

    // Videos: serve HLS (fallback)
    if (!video.hls_ready || !video.hls_path) {
      return res.status(202).json({
        error: "Video is still being processed. Please try again later.",
      });
    }

    const hlsDir = video.hls_path.replace(/\/master\.m3u8$/, "");
    const qualityOrder = ["4k", "1080p", "720p", "360p"];
    let bestPlaylistKey = null;

    for (const q of qualityOrder) {
      try {
        const testKey = `${hlsDir}/${q}/playlist.m3u8`;
        await getVideoStream(req.bucket, testKey);
        bestPlaylistKey = testKey;
        break;
      } catch (_) {
        // Quality not available, try next
      }
    }

    if (!bestPlaylistKey) {
      return res.status(404).json({ error: "No downloadable quality found" });
    }

    const stream = await getVideoStream(req.bucket, bestPlaylistKey);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${video.filename.replace(/\.[^/.]+$/, "")}.m3u8"`,
    );
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    stream.pipe(res);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to download" });
  }
}

// Download multiple videos as a zip file
export async function downloadVideosZip(req, res) {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No video IDs provided" });
    }
    if (ids.length > 50) {
      return res.status(400).json({ error: "Maximum 50 files per zip download" });
    }

    const archiver = (await import("archiver")).default;
    const archive = archiver("zip", { zlib: { level: 5 } });

    const timestamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="download-${timestamp}.zip"`);

    archive.pipe(res);

    archive.on("error", (err) => {
      console.error("Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create zip" });
      }
    });

    const { getObjectStream, resolveBucket: resolve } = await import("../services/storage.js");

    for (const id of ids) {
      try {
        const video = await getVideoById(id, req.bucket);
        if (!video) continue;

        const { bucket: physicalBucket } = resolve(video.bucket);
        const stream = await getObjectStream(physicalBucket, video.object_key);
        archive.append(stream, { name: video.filename });
      } catch (err) {
        console.warn(`Skipping video ${id} in zip: ${err.message}`);
      }
    }

    await archive.finalize();
  } catch (error) {
    apiError(req, error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to create zip download" });
    }
  }
}

// Delete a video (soft delete to backup)
export async function removeVideo(req, res) {
  try {
    const { id } = req.params;
    const video = await getVideoById(id, req.bucket);

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Admin, video_editor, project_manager, social_media_manager can delete
    const allowedRoles = [
      "admin",
      "video_editor",
      "project_manager",
      "social_media_manager",
    ];
    if (!allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: "You do not have permission to delete videos" });
    }

    // Admin password verification for sensitive actions
    if (req.user.role === "admin") {
      const { password } = req.body;
      console.log("Deletion requested by admin. Verification starting...");

      if (!password) {
        console.log("Deletion failed: No password provided in request body.");
        return res
          .status(400)
          .json({ error: "Password is required to confirm deletion" });
      }

      const { getUserByEmail, verifyPassword } =
        await import("../services/user.js");
      const user = await getUserByEmail(req.user.email);
      if (!user) {
        console.log(
          `Deletion failed: Admin user not found with email ${req.user.email}`,
        );
        return res.status(404).json({ error: "User not found" });
      }

      const isValid = await verifyPassword(password, user.password);
      if (!isValid) {
        console.log("Deletion failed: Invalid admin password provided.");
        return res.status(403).json({ error: "Invalid password" });
      }
      console.log("Admin password verified successfully.");
    }

    console.log(`Deleting video ${id} from bucket ${req.bucket}...`);
    await deleteVideo(id, req.user.id);
    console.log(`Video ${id} deleted successfully.`);
    res.json({ message: "Video moved to recently deleted" });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: error.message || "Failed to delete video" });
  }
}

export async function streamVideo(req, res) {
  try {
    const { id } = req.params;
    const video = await getVideoById(id, req.bucket);

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    if (!video.hls_ready) {
      return res.status(202).json({
        error: "Video is still being processed. Please use the HLS endpoint once ready.",
      });
    }

    // Try to serve original file directly as an inline video stream.
    // This allows the <video> element (fallback path in HLSPlayer) to play natively in Chrome.
    if (video.object_key) {
      try {
        const ext = (video.filename || "").split(".").pop()?.toLowerCase() || "mp4";
        const mimeTypes = {
          mp4: "video/mp4",
          mov: "video/quicktime",
          webm: "video/webm",
          avi: "video/x-msvideo",
          mkv: "video/x-matroska",
          flv: "video/x-flv",
          wmv: "video/x-ms-wmv",
          "3gp": "video/3gpp",
        };
        const mimeType = mimeTypes[ext] || "video/mp4";

        // Forward Range header to S3 for proper video seeking and duration detection.
        const rangeHeader = req.headers.range || null;
        const { stream, contentLength, contentRange } = await getVideoStreamWithMeta(
          req.bucket,
          video.object_key,
          rangeHeader,
        );

        res.setHeader("Content-Type", mimeType);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Cache-Control", "no-cache");
        if (contentLength != null) {
          res.setHeader("Content-Length", contentLength);
        }
        if (rangeHeader) {
          if (contentRange) res.setHeader("Content-Range", contentRange);
          res.status(206);
        }
        return stream.pipe(res);
      } catch (_) {
        // Original file not in S3 — fall through to HLS
      }
    }

    // Fallback: serve HLS master playlist (works natively in Safari)
    if (video.hls_path) {
      try {
        const stream = await getVideoStream(req.bucket, video.hls_path);
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Cache-Control", "no-cache");
        return stream.pipe(res);
      } catch (_) {
        console.warn(
          `[Stream] HLS files missing in S3 for video ${id} (hls_path: ${video.hls_path}). Marking as not ready.`,
        );
        // HLS path exists in DB but files are missing from S3 — mark video as needing reprocessing
        const { getPool } = await import("../db/index.js");
        await getPool().query(
          "UPDATE videos SET hls_ready = FALSE, processing_status = 'failed', processing_step = $1 WHERE id = $2",
          ["error: HLS files missing from storage — please re-upload or reprocess", id],
        );
        return res.status(410).json({
          error: "Video files are missing from storage. Please re-upload or reprocess this video.",
          code: "FILES_MISSING",
        });
      }
    }

    return res.status(404).json({ error: "Video stream not available" });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to stream video" });
  }
}

// Stream HLS files (master playlist, variant playlists, segments)
export async function streamHLS(req, res) {
  try {
    const { id } = req.params;
    const hlsFile = req.params[0];
    const bucket = req.bucket;
    const video = await getVideoById(id, bucket);

    if (!video || !video.hls_ready) {
      console.warn(
        `[HLS] Video ${id} not found or not HLS-ready. Bucket: ${bucket}`,
      );
      return res
        .status(404)
        .json({ error: "HLS not available for this video" });
    }

    const hlsDir = video.hls_path.replace(/\/master\.m3u8$/, "");
    const objectKey = `${hlsDir}/${hlsFile}`;

    const contentType = hlsFile.endsWith(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : "video/MP2T";

    let stream;
    try {
      stream = await getVideoStream(bucket || video.bucket, objectKey);
    } catch (s3Error) {
      console.error(
        `[HLS] S3 fetch failed: bucket=${bucket}, key=${objectKey}, error=${s3Error.message}`,
      );
      // If the master playlist itself is missing, mark the video as needing reprocessing
      if (hlsFile === "master.m3u8" || hlsFile.endsWith("/master.m3u8")) {
        const { getPool } = await import("../db/index.js");
        await getPool().query(
          "UPDATE videos SET hls_ready = FALSE, processing_status = 'failed', processing_step = $1 WHERE id = $2",
          ["error: HLS files missing from storage — please re-upload or reprocess", id],
        );
      }
      return res.status(404).json({ error: "HLS file not found in storage", code: "FILES_MISSING" });
    }

    // Playlists (.m3u8) must not be cached so replacements are picked up immediately.
    // Segments (.ts) use a moderate cache since their paths change on re-encode.
    const cacheControl = hlsFile.endsWith(".m3u8")
      ? "no-cache"
      : "public, max-age=300";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", cacheControl);
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");

    // For .m3u8 playlists, rewrite relative URIs to include token & bucket
    // so that hls.js sub-requests don't lose authentication/bucket context.
    if (hlsFile.endsWith(".m3u8")) {
      const token = req.query.token || req.headers.authorization?.substring(7);
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("error", (err) => {
        console.error(`[HLS] Stream read error for ${objectKey}: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to read HLS playlist" });
        } else {
          res.end();
        }
      });
      stream.on("end", () => {
        let playlist = Buffer.concat(chunks).toString("utf8");
        // Rewrite relative URIs (lines not starting with #) to include query params
        const params = new URLSearchParams();
        if (bucket) params.set("bucket", bucket);
        if (token) params.set("token", token);
        const qs = params.toString();
        if (qs) {
          playlist = playlist
            .split("\n")
            .map((line) => {
              const trimmed = line.trim();
              if (trimmed && !trimmed.startsWith("#")) {
                return `${trimmed}?${qs}`;
              }
              return line;
            })
            .join("\n");
        }
        res.send(playlist);
      });
    } else {
      // For .ts segments, pipe directly
      stream.on("error", (err) => {
        console.error(`[HLS] Stream error for ${objectKey}: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to stream HLS segment" });
        } else {
          res.end();
        }
      });
      stream.pipe(res);
    }
  } catch (error) {
    apiError(req, error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream HLS content" });
    }
  }
}

// Trigger reprocessing of a video whose original file already exists in S3
// Used when a video is stuck (hls_ready=false) but the original was already uploaded
export async function reprocessVideo(req, res) {
  try {
    const { id } = req.params;

    const allowedRoles = ["admin", "project_manager", "video_editor"];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions to reprocess videos" });
    }

    const video = await getVideoById(id, req.bucket);
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    if (video.media_type !== "video") {
      return res.status(400).json({ error: "Only videos can be reprocessed" });
    }

    if (video.hls_ready) {
      return res.status(400).json({ error: "Video is already processed" });
    }

    // Check if already queued or processing
    const currentInfo = await processingQueue.getProcessingInfo(id);
    if (currentInfo && (currentInfo.processing_status === "queued" || currentInfo.processing_status === "processing")) {
      return res.status(400).json({ error: "Video is already queued for processing" });
    }

    // Find the original file in S3
    const { s3ObjectExists, resolveBucket: resolve } = await import("../services/storage.js");
    const { prefix } = resolve(req.bucket);
    const safeName = video.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const permanentKey = `${prefix}videos/${id}/${safeName}`;

    let sourceKey = null;

    // Check permanent location first
    if (await s3ObjectExists(req.bucket, permanentKey)) {
      sourceKey = permanentKey;
    } else if (video.object_key && await s3ObjectExists(req.bucket, video.object_key)) {
      // Fall back to whatever object_key is in the DB
      sourceKey = video.object_key;
    }

    if (!sourceKey) {
      return res.status(404).json({
        error: "Original video file not found in storage. Please re-upload the video.",
      });
    }

    console.log(`[Reprocess] Queuing video ${id} for reprocessing from S3 key: ${sourceKey}`);
    await processingQueue.enqueue(id, sourceKey, req.bucket, safeName);

    res.json({ message: "Video queued for reprocessing", sourceKey });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to trigger reprocessing" });
  }
}

// Get processing status for a video (queue position, progress, step)
export async function getProcessingStatus(req, res) {
  try {
    const { id } = req.params;
    const info = await processingQueue.getProcessingInfo(id);

    if (!info) {
      return res.status(404).json({ error: "Video not found" });
    }

    res.json(info);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get processing status" });
  }
}

// Admin endpoint: check health of videos in a workspace (verify S3 files exist)
export async function checkVideoHealth(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }

    const { getPool } = await import("../db/index.js");
    const { s3ObjectExists } = await import("../services/storage.js");
    const pool = getPool();

    const result = await pool.query(
      `SELECT id, filename, object_key, hls_path, hls_ready, processing_status, media_type
       FROM videos WHERE bucket = $1 AND media_type = 'video'
       ORDER BY created_at DESC LIMIT 50`,
      [req.bucket],
    );

    const health = [];
    for (const video of result.rows) {
      const entry = {
        id: video.id,
        filename: video.filename,
        hls_ready: video.hls_ready,
        processing_status: video.processing_status,
        original_exists: false,
        hls_exists: false,
      };

      if (video.object_key) {
        entry.original_exists = await s3ObjectExists(req.bucket, video.object_key);
      }
      if (video.hls_path) {
        entry.hls_exists = await s3ObjectExists(req.bucket, video.hls_path);
      }

      health.push(entry);
    }

    const summary = {
      total: health.length,
      healthy: health.filter((v) => v.hls_exists || v.original_exists).length,
      missing_all: health.filter((v) => !v.hls_exists && !v.original_exists).length,
      missing_hls: health.filter((v) => v.hls_ready && !v.hls_exists).length,
    };

    res.json({ summary, videos: health });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to check video health" });
  }
}
