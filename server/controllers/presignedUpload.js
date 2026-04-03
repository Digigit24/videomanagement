import { generatePresignedUploadUrl, resolveBucket } from "../services/storage.js";
import { createVideo } from "../services/video.js";
import { apiError } from "../utils/logger.js";
import { notifyWorkspaceMembers } from "../services/notification.js";
import { getWorkspaceByBucket } from "../services/workspace.js";
import processingQueue from "../services/processingQueue.js";

/**
 * POST /api/upload/presign
 * Generates a presigned S3 PUT URL so the browser can upload directly to S3.
 * Also creates the video DB record immediately (status = uploading).
 */
export async function getPresignedUploadUrl(req, res) {
  try {
    const { filename, mimetype, size, replaceVideoId, folderId } = req.body;

    if (!filename || !mimetype) {
      return res.status(400).json({ error: "filename and mimetype are required" });
    }

    // Permission check
    const allowedRoles = [
      "admin", "video_editor", "project_manager", "social_media_manager",
      "client", "member", "videographer", "photo_editor",
    ];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to upload" });
    }

    const { prefix } = resolveBucket(req.bucket);
    const isPhoto = mimetype.startsWith("image/");
    const mediaType = isPhoto ? "photo" : "video";

    // Sanitize filename
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = Date.now();
    const objectKey = `${timestamp}-${safeName}`;

    // Generate presigned URL for direct S3 upload
    const presigned = await generatePresignedUploadUrl(
      req.bucket,
      objectKey,
      mimetype,
      3600, // 1 hour expiry
    );

    // Create DB record immediately so we can track the upload
    const video = await createVideo({
      bucket: req.bucket,
      filename: filename,
      objectKey: presigned.key,
      size: size || 0,
      uploadedBy: req.user.id,
      replaceVideoId: replaceVideoId || null,
      folderId: folderId || null,
      mediaType,
    });

    console.log(
      `[Presigned] ${mediaType} presign generated: filename=${safeName}, s3Key=${presigned.key}, videoId=${video.id}`,
    );

    res.json({
      uploadUrl: presigned.url,
      objectKey: presigned.key,
      videoId: video.id,
      mediaType,
    });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
}

/**
 * POST /api/upload/confirm
 * Called after the browser finishes uploading directly to S3.
 * Triggers video processing (for videos) or finalizes the record (for photos).
 */
export async function confirmUpload(req, res) {
  try {
    const { videoId } = req.body;

    if (!videoId) {
      return res.status(400).json({ error: "videoId is required" });
    }

    const { getPool } = await import("../db/index.js");
    const pool = getPool();

    // Fetch the video record
    const result = await pool.query(
      "SELECT id, bucket, filename, object_key, media_type, size FROM videos WHERE id = $1",
      [videoId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Video not found" });
    }

    const video = result.rows[0];

    // Verify the user owns this upload (uploaded_by check)
    const ownerCheck = await pool.query(
      "SELECT uploaded_by FROM videos WHERE id = $1",
      [videoId],
    );
    if (ownerCheck.rows[0]?.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to confirm this upload" });
    }

    const safeName = video.filename.replace(/[^a-zA-Z0-9._-]/g, "_");

    if (video.media_type === "photo") {
      // Photos: mark as completed immediately (already in S3)
      await pool.query(
        `UPDATE videos SET hls_ready = FALSE, processing_status = 'completed' WHERE id = $1`,
        [videoId],
      );
      console.log(`[Presigned] Photo confirmed and finalized: ${video.object_key}`);
    } else {
      // Videos: enqueue for HLS processing (reads from S3)
      processingQueue
        .enqueue(video.id, video.object_key, video.bucket, safeName)
        .catch((err) => {
          console.error(`Failed to enqueue video ${video.id}:`, err.message);
        });
      console.log(`[Presigned] Video confirmed, enqueued for processing: ${video.id}`);
    }

    // Send notification
    try {
      const workspace = await getWorkspaceByBucket(video.bucket);
      if (workspace) {
        const userName = req.user.name || req.user.email;
        await notifyWorkspaceMembers(
          workspace.id,
          req.user.id,
          "video_uploaded",
          `New Upload — ${workspace.client_name}`,
          `${userName} uploaded "${video.filename}" to ${workspace.client_name}`,
          "video",
          videoId,
        );
      }
    } catch (e) {
      console.error("Notification error:", e);
    }

    res.json({
      video: { ...video, media_type: video.media_type },
      message: video.media_type === "photo"
        ? "Photo uploaded successfully."
        : "Video uploaded. Processing will start shortly.",
    });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to confirm upload" });
  }
}
