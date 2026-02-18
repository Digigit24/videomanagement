import multer from "multer";
import fs from "fs";
import {
  getVideos,
  getVideoById,
  updateVideoStatus,
  createVideo,
  getVideoVersions,
  getDeletedVideos,
  restoreDeletedVideo,
  cleanupExpiredBackups,
  deleteVideo,
} from "../services/video.js";
import {
  getVideoStream,
  resolveBucket,
} from "../services/storage.js";
import { uploadFileToS3 } from "../services/upload.js";
import processingQueue from "../services/processingQueue.js";
import { apiError } from "../utils/logger.js";
import { notifyWorkspaceMembers } from "../services/notification.js";
import { getWorkspaceByBucket } from "../services/workspace.js";

const upload = multer({
  storage: multer.diskStorage({}), // Uses system temp directory
  limits: { fileSize: 50 * 1024 * 1024 * 1024 }, // 50GB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["video/mp4", "video/quicktime", "video/webm"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only MP4, MOV, and WebM are allowed."));
    }
  },
});

export const uploadMiddleware = upload.single("video");

export async function listVideos(req, res) {
  try {
    const videos = await getVideos(req.bucket);
    res.json({ videos });
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

    if (!status) {
      return res.status(400).json({ error: "Status required" });
    }

    // Only admin, project_manager, and client can change video status
    const statusChangeRoles = ["admin", "project_manager", "client"];
    if (!statusChangeRoles.includes(userRole)) {
      return res
        .status(403)
        .json({ error: "Only admin, project manager, or client can change video status" });
    }

    const video = await updateVideoStatus(id, status, req.user.id);

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Send notification to ALL workspace members (including clients and admins)
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
        return res.status(400).json({ error: "No video file provided" });
      }

      // All workspace members can upload videos
      const allowedRoles = [
        "admin",
        "video_editor",
        "project_manager",
        "social_media_manager",
        "client",
        "member",
      ];
      if (!allowedRoles.includes(req.user.role)) {
        return res
          .status(403)
          .json({ error: "You do not have permission to upload videos" });
      }

      const { originalname, path: filePath, size, mimetype } = req.file;
      const { bucket: resolvedBucket, prefix } = resolveBucket(req.bucket);
      const objectKey = `${prefix}${Date.now()}-${originalname}`;
      const replaceVideoId = req.body.replaceVideoId || null;

      // Step 1: Upload the original video to S3 immediately (as a temp file).
      // This frees server disk space as fast as possible.
      const tempS3Key = `${prefix}temp-uploads/${Date.now()}-${originalname}`;
      console.log(`Uploading video to S3 temp: ${tempS3Key}`);
      await uploadFileToS3(resolvedBucket, tempS3Key, filePath, mimetype);
      console.log(`Video uploaded to S3 temp: ${tempS3Key}`);

      // Step 2: Delete local temp file immediately to free server disk space
      try {
        fs.unlinkSync(filePath);
        console.log(`Local temp file deleted: ${filePath}`);
      } catch (e) {
        console.warn(`Failed to delete local temp: ${e.message}`);
      }

      // Step 3: Create video record in database
      const video = await createVideo({
        bucket: req.bucket,
        filename: originalname,
        objectKey,
        size,
        uploadedBy: req.user.id,
        replaceVideoId,
      });

      // Send notification
      try {
        const workspace = await getWorkspaceByBucket(req.bucket);
        if (workspace) {
          const userName = req.user.name || req.user.email;
          await notifyWorkspaceMembers(
            workspace.id,
            req.user.id,
            "video_uploaded",
            `New Video — ${workspace.client_name}`,
            `${userName} uploaded "${originalname}" to ${workspace.client_name}`,
            "video",
            video.id,
          );
        }
      } catch (e) {
        console.error("Notification error:", e);
      }

      // Step 4: Enqueue for HLS processing.
      // The queue processes videos sequentially (one at a time) to prevent CPU overload.
      // Each video tracks its queue position and processing progress.
      processingQueue.enqueue(video.id, tempS3Key, req.bucket, originalname)
        .catch((err) => {
          console.error(`Failed to enqueue video ${video.id}:`, err.message);
        });

      res.status(201).json({
        video,
        message: "Video uploaded to storage. Processing started in background.",
      });
    } catch (error) {
      apiError(req, error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to upload video" });
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

// Download video — serves the highest quality HLS variant playlist
// since the original file is not stored in S3 (only HLS chunks are).
export async function downloadVideo(req, res) {
  try {
    const { id } = req.params;
    const video = await getVideoById(id, req.bucket);

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    if (!video.hls_ready || !video.hls_path) {
      return res
        .status(202)
        .json({ error: "Video is still being processed. Please try again later." });
    }

    // Serve the highest quality HLS variant as a download stream.
    // Find the highest quality directory from the HLS path.
    const hlsDir = video.hls_path.replace(/\/master\.m3u8$/, "");

    // Determine the best available quality (try from highest to lowest)
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

    // Stream the playlist (the player/client can use it to download segments)
    const stream = await getVideoStream(req.bucket, bestPlaylistKey);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${video.filename.replace(/\.[^/.]+$/, "")}.m3u8"`,
    );
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    stream.pipe(res);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to download video" });
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
      if (!password) {
        return res
          .status(400)
          .json({ error: "Password is required to confirm deletion" });
      }

      const { getUserByEmail, verifyPassword } =
        await import("../services/user.js");
      const user = await getUserByEmail(req.user.email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const isValid = await verifyPassword(password, user.password);
      if (!isValid) {
        return res.status(403).json({ error: "Invalid password" });
      }
    }

    await deleteVideo(id, req.user.id);
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

    // Since the original video is NOT stored in S3 (only HLS chunks are),
    // direct streaming is only possible when HLS is ready.
    // The frontend should use the HLS player; this endpoint exists as a fallback.
    if (!video.hls_ready) {
      return res
        .status(202)
        .json({ error: "Video is still being processed. Please use the HLS endpoint once ready." });
    }

    // Redirect the caller to use HLS streaming instead.
    // For backward compatibility, try to stream the HLS master playlist.
    const hlsMasterKey = video.hls_path;
    if (hlsMasterKey) {
      const stream = await getVideoStream(req.bucket, hlsMasterKey);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "public, max-age=3600");
      stream.pipe(res);
    } else {
      return res
        .status(404)
        .json({ error: "Video stream not available" });
    }
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
    const video = await getVideoById(id, req.bucket);

    if (!video || !video.hls_ready) {
      return res
        .status(404)
        .json({ error: "HLS not available for this video" });
    }

    const hlsDir = video.hls_path.replace(/\/master\.m3u8$/, "");
    const objectKey = `${hlsDir}/${hlsFile}`;

    const contentType = hlsFile.endsWith(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : "video/MP2T";

    const stream = await getVideoStream(req.bucket, objectKey);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000");
    res.setHeader("Access-Control-Allow-Origin", "*");
    stream.pipe(res);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to stream HLS content" });
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

// Run cleanup periodically (called on startup and every hour)
export function startBackupCleanup() {
  // Run cleanup immediately
  cleanupExpiredBackups();

  // Run every hour
  setInterval(
    () => {
      cleanupExpiredBackups();
    },
    60 * 60 * 1000,
  );
}
