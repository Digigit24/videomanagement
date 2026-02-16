import multer from "multer";
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
  getVideoMetadata,
  resolveBucket,
} from "../services/storage.js";
import { uploadToS3 } from "../services/upload.js";
import { processVideoToHLS } from "../services/ffmpeg.js";
import { apiError } from "../utils/logger.js";
import { notifyWorkspaceMembers } from "../services/notification.js";
import { getWorkspaceByBucket } from "../services/workspace.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5GB
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

    // Only client and admin can change video status
    if (userRole !== "client" && userRole !== "admin") {
      return res
        .status(403)
        .json({ error: "Only clients can change video status" });
    }

    const video = await updateVideoStatus(id, status, req.user.id);

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Send notification
    try {
      const workspace = await getWorkspaceByBucket(video.bucket);
      if (workspace) {
        const userName = req.user.name || req.user.email;
        await notifyWorkspaceMembers(
          workspace.id,
          req.user.id,
          "status_changed",
          `Video ${status}`,
          `${userName} changed "${video.filename}" to ${status}`,
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

      // Admin, editor, project_manager, social_media_manager can upload videos
      const allowedRoles = [
        "admin",
        "video_editor",
        "project_manager",
        "social_media_manager",
        "client",
      ];
      if (!allowedRoles.includes(req.user.role)) {
        return res
          .status(403)
          .json({ error: "You do not have permission to upload videos" });
      }

      const { originalname, buffer, size, mimetype } = req.file;
      const { bucket: targetBucket, prefix } = resolveBucket(req.bucket);
      const objectKey = `${prefix}${Date.now()}-${originalname}`;
      const parentVideoId = req.body.parentVideoId || null;

      // Upload original to S3
      await uploadToS3(targetBucket, objectKey, buffer, mimetype);

      // Create video record in database
      const video = await createVideo({
        bucket: req.bucket,
        filename: originalname,
        objectKey,
        size,
        uploadedBy: req.user.id,
        parentVideoId,
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
            "New Video",
            `${userName} uploaded "${originalname}" to ${workspace.client_name}`,
            "video",
            video.id,
          );
        }
      } catch (e) {
        console.error("Notification error:", e);
      }

      // Process HLS in background (don't await)
      processVideoToHLS(buffer, video.id, req.bucket, originalname).catch(
        (err) => {
          console.error("Background HLS processing failed:", err.message);
        },
      );

      res.status(201).json({
        video,
        message: "Video uploaded successfully. HLS processing started.",
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

// Download video
export async function downloadVideo(req, res) {
  try {
    const { id } = req.params;
    const video = await getVideoById(id, req.bucket);

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    const stream = await getVideoStream(req.bucket, video.object_key);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${video.filename}"`,
    );
    res.setHeader("Content-Type", "application/octet-stream");
    if (video.size) {
      res.setHeader("Content-Length", video.size);
    }

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
        return res.status(401).json({ error: "Invalid password" });
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

    const ext = video.filename.toLowerCase().split(".").pop();
    const contentTypes = {
      mp4: "video/mp4",
      mov: "video/quicktime",
      webm: "video/webm",
    };

    const contentType = contentTypes[ext] || "video/mp4";
    const fileSize = video.size;

    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      });

      const stream = await getVideoStream(
        req.bucket,
        video.object_key,
        start,
        end,
      );
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      });

      const stream = await getVideoStream(req.bucket, video.object_key);
      stream.pipe(res);
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
