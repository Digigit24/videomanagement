import pool from "../db/index.js";
import { listVideos as listStorageVideos } from "./storage.js";
import { logActivity } from "./activity.js";

export async function createVideo({
  bucket,
  filename,
  objectKey,
  size,
  uploadedBy,
  replaceVideoId = null,
}) {
  try {
    // If replacing an existing video, delete the old one first
    if (replaceVideoId) {
      const oldVideo = await pool().query(
        "SELECT * FROM videos WHERE id = $1",
        [replaceVideoId],
      );
      if (oldVideo.rows[0]) {
        // Move old video to deleted_videos backup
        const v = oldVideo.rows[0];
        await pool().query(
          `INSERT INTO deleted_videos (original_video_id, version_group_id, version_number, bucket, filename, object_key, size, status, hls_ready, hls_path, uploaded_by, uploaded_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            v.id,
            v.version_group_id,
            v.version_number,
            v.bucket,
            v.filename,
            v.object_key,
            v.size,
            v.status,
            v.hls_ready,
            v.hls_path,
            v.uploaded_by,
            v.uploaded_at,
            v.created_at,
          ],
        );

        // Delete old video record
        await pool().query("DELETE FROM videos WHERE id = $1", [
          replaceVideoId,
        ]);
      }
    }

    const result = await pool().query(
      `INSERT INTO videos (bucket, filename, object_key, size, uploaded_by, uploaded_at, created_at, version_group_id, version_number, is_active_version, parent_video_id)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, gen_random_uuid(), 1, TRUE, NULL)
       RETURNING *`,
      [bucket, filename, objectKey, size, uploadedBy],
    );

    const video = result.rows[0];

    // Log activity
    await logActivity(uploadedBy, "video_uploaded", "video", video.id, {
      filename,
      bucket,
      size,
      replacedVideo: !!replaceVideoId,
    });

    return video;
  } catch (error) {
    console.error("Error creating video:", error);
    throw error;
  }
}

export async function syncBucketVideos(bucket) {
  try {
    const storageVideos = await listStorageVideos(bucket);

    // Exclude temp-uploads, hls, and thumbnails directories from sync —
    // those are managed by the upload/processing pipeline, not raw video files.
    // Note: match without leading "/" so it works both with and without workspace prefix
    // e.g. "temp-uploads/..." (no prefix) and "workspaces/slug/temp-uploads/..." (with prefix)
    const filteredVideos = storageVideos.filter(
      (v) => !v.object_key.includes("temp-uploads/") &&
             !v.object_key.includes("hls/") &&
             !v.object_key.includes("thumbnails/")
    );

    for (const video of filteredVideos) {
      await pool().query(
        `INSERT INTO videos (bucket, filename, object_key, size, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (bucket, object_key)
         DO UPDATE SET
           size = EXCLUDED.size,
           updated_at = CURRENT_TIMESTAMP`,
        [
          bucket,
          video.filename,
          video.object_key,
          video.size,
          video.last_modified,
        ],
      );
    }

    return storageVideos.length;
  } catch (error) {
    console.error("Error syncing videos:", error);
    throw error;
  }
}

export async function getVideos(bucket) {
  try {
    // Videos are created in the DB during upload (createVideo) — no need to
    // sync with S3 on every list request. The old syncBucketVideos call was
    // creating duplicate entries for temp-upload files still in S3.
    const result = await pool().query(
      `SELECT v.*, u.name as uploaded_by_name, u.email as uploaded_by_email
       FROM videos v
       LEFT JOIN users u ON v.uploaded_by = u.id
       WHERE v.bucket = $1 AND v.is_active_version = TRUE
       ORDER BY v.created_at DESC`,
      [bucket],
    );

    return result.rows;
  } catch (error) {
    console.error("Error getting videos:", error);
    throw error;
  }
}

export async function getVideosPollHash(bucket) {
  try {
    const result = await pool().query(
      `SELECT COUNT(*) as count,
              MAX(updated_at) as last_updated,
              MAX(created_at) as last_created
       FROM videos
       WHERE bucket = $1 AND is_active_version = TRUE`,
      [bucket],
    );
    const row = result.rows[0];
    return {
      count: parseInt(row.count),
      lastUpdated: row.last_updated,
      lastCreated: row.last_created,
    };
  } catch (error) {
    console.error("Error getting videos poll hash:", error);
    throw error;
  }
}

export async function getBucketByVideoId(id) {
  try {
    const result = await pool().query(
      "SELECT bucket FROM videos WHERE id = $1",
      [id],
    );
    return result.rows[0]?.bucket || null;
  } catch (error) {
    console.error("Error getting bucket by video ID:", error);
    throw error;
  }
}

export async function getVideoById(id, bucket) {
  try {
    const result = await pool().query(
      `SELECT v.*, u.name as uploaded_by_name, u.email as uploaded_by_email
       FROM videos v
       LEFT JOIN users u ON v.uploaded_by = u.id
       WHERE v.id = $1 AND v.bucket = $2`,
      [id, bucket],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting video by ID:", error);
    throw error;
  }
}

// Get all versions of a video (version history) - kept for backward compat
export async function getVideoVersions(versionGroupId, bucket) {
  try {
    const result = await pool().query(
      `SELECT v.*, u.name as uploaded_by_name, u.email as uploaded_by_email
       FROM videos v
       LEFT JOIN users u ON v.uploaded_by = u.id
       WHERE v.version_group_id = $1 AND v.bucket = $2
       ORDER BY v.version_number DESC`,
      [versionGroupId, bucket],
    );
    return result.rows;
  } catch (error) {
    console.error("Error getting video versions:", error);
    throw error;
  }
}

export async function updateVideoStatus(id, status, userId) {
  try {
    const validStatuses = [
      "Pending",
      "Under Review",
      "Approved",
      "Changes Needed",
      "Rejected",
      "Posted",
    ];

    if (!validStatuses.includes(status)) {
      throw new Error("Invalid status");
    }

    // Get current status
    const current = await pool().query(
      "SELECT status, version_group_id, bucket FROM videos WHERE id = $1",
      [id],
    );
    if (current.rows.length === 0) return null;

    const oldStatus = current.rows[0]?.status;
    const bucket = current.rows[0]?.bucket;

    // If changing to "Posted", also set posted_at timestamp
    const postedClause =
      status === "Posted" ? ", posted_at = CURRENT_TIMESTAMP" : "";

    const result = await pool().query(
      `UPDATE videos SET status = $1, updated_at = CURRENT_TIMESTAMP${postedClause} WHERE id = $2 RETURNING *`,
      [status, id],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const video = result.rows[0];

    // Record status change in workspace_video_stats for historical tracking
    try {
      await pool().query(
        `INSERT INTO workspace_video_stats (workspace_bucket, video_id, video_filename, status_changed_to, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [bucket, id, video.filename, status, userId],
      );
    } catch (statsErr) {
      console.error("Error recording video stats:", statsErr);
    }

    // Log activity
    if (userId) {
      await logActivity(userId, "status_changed", "video", id, {
        oldStatus,
        newStatus: status,
      });
    }

    return video;
  } catch (error) {
    console.error("Error updating video status:", error);
    throw error;
  }
}

// Get deleted videos (backup) for a bucket
export async function getDeletedVideos(bucket) {
  try {
    const result = await pool().query(
      `SELECT dv.*, u.name as uploaded_by_name
       FROM deleted_videos dv
       LEFT JOIN users u ON dv.uploaded_by = u.id
       WHERE dv.bucket = $1 AND dv.expires_at > CURRENT_TIMESTAMP
       ORDER BY dv.deleted_at DESC`,
      [bucket],
    );
    return result.rows;
  } catch (error) {
    console.error("Error getting deleted videos:", error);
    throw error;
  }
}

// Restore a deleted video
export async function restoreDeletedVideo(deletedVideoId) {
  try {
    const deleted = await pool().query(
      "SELECT * FROM deleted_videos WHERE id = $1 AND expires_at > CURRENT_TIMESTAMP",
      [deletedVideoId],
    );

    if (deleted.rows.length === 0) {
      throw new Error("Deleted video not found or expired");
    }

    const dv = deleted.rows[0];

    // Re-insert into videos table
    await pool().query(
      `INSERT INTO videos (id, bucket, filename, object_key, size, status, hls_ready, hls_path, uploaded_by, uploaded_at, created_at, version_group_id, version_number, is_active_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE)`,
      [
        dv.original_video_id,
        dv.bucket,
        dv.filename,
        dv.object_key,
        dv.size,
        dv.status || "Pending",
        dv.hls_ready,
        dv.hls_path,
        dv.uploaded_by,
        dv.uploaded_at,
        dv.created_at,
        dv.version_group_id,
        dv.version_number,
      ],
    );

    // Remove from deleted
    await pool().query("DELETE FROM deleted_videos WHERE id = $1", [
      deletedVideoId,
    ]);

    return { success: true };
  } catch (error) {
    console.error("Error restoring deleted video:", error);
    throw error;
  }
}

// Permanently delete expired backups
export async function cleanupExpiredBackups() {
  try {
    const result = await pool().query(
      "DELETE FROM deleted_videos WHERE expires_at <= CURRENT_TIMESTAMP RETURNING id",
    );
    if (result.rows.length > 0) {
      console.log(`Cleaned up ${result.rows.length} expired backup(s)`);
    }
    return result.rows.length;
  } catch (error) {
    console.error("Error cleaning up expired backups:", error);
  }
}

// Delete a video (move to trash with 3-day backup)
export async function deleteVideo(videoId, userId) {
  try {
    const video = await pool().query("SELECT * FROM videos WHERE id = $1", [
      videoId,
    ]);
    if (video.rows.length === 0) {
      throw new Error("Video not found");
    }

    const v = video.rows[0];

    // Insert into deleted_videos backup
    await pool().query(
      `INSERT INTO deleted_videos (original_video_id, version_group_id, version_number, bucket, filename, object_key, size, status, hls_ready, hls_path, uploaded_by, uploaded_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        v.id,
        v.version_group_id,
        v.version_number,
        v.bucket,
        v.filename,
        v.object_key,
        v.size,
        v.status,
        v.hls_ready,
        v.hls_path,
        v.uploaded_by,
        v.uploaded_at,
        v.created_at,
      ],
    );

    // Delete related data first to avoid foreign key constraint errors
    await pool().query("DELETE FROM video_share_tokens WHERE video_id = $1", [
      videoId,
    ]);
    await pool().query("DELETE FROM video_viewers WHERE video_id = $1", [
      videoId,
    ]);
    await pool().query("DELETE FROM comments WHERE video_id = $1", [videoId]);
    // Note: workspace_video_stats is kept for historical tracking (usually doesn't have a FK blocking deletion)

    // Delete from videos
    const deleteResult = await pool().query(
      "DELETE FROM videos WHERE id = $1",
      [videoId],
    );

    if (deleteResult.rowCount === 0) {
      console.warn(
        `Video ${videoId} was not found in videos table during final deletion.`,
      );
    }

    // Log activity
    if (userId) {
      await logActivity(userId, "video_deleted", "video", videoId, {
        filename: v.filename,
        bucket: v.bucket,
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting video:", error);
    throw error;
  }
}
