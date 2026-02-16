import pool from "../db/index.js";
import { listVideos as listStorageVideos } from "./storage.js";
import { logActivity } from "./activity.js";

export async function createVideo({
  bucket,
  filename,
  objectKey,
  size,
  uploadedBy,
  versionGroupId = null,
  parentVideoId = null,
}) {
  try {
    let versionNumber = 1;
    let groupId = versionGroupId;

    if (parentVideoId) {
      // This is a new version of an existing video
      const parentResult = await pool().query(
        "SELECT version_group_id, version_number FROM videos WHERE id = $1",
        [parentVideoId],
      );
      if (parentResult.rows[0]) {
        groupId = parentResult.rows[0].version_group_id;
        versionNumber = parentResult.rows[0].version_number + 1;

        // Get max version in this group
        const maxResult = await pool().query(
          "SELECT MAX(version_number) as max_ver FROM videos WHERE version_group_id = $1",
          [groupId],
        );
        versionNumber = (maxResult.rows[0]?.max_ver || 0) + 1;

        // Deactivate all other versions in the group
        await pool().query(
          "UPDATE videos SET is_active_version = FALSE WHERE version_group_id = $1",
          [groupId],
        );
      }
    }

    const result = await pool().query(
      `INSERT INTO videos (bucket, filename, object_key, size, uploaded_by, uploaded_at, created_at, version_group_id, version_number, is_active_version, parent_video_id)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, COALESCE($6, gen_random_uuid()), $7, TRUE, $8)
       RETURNING *`,
      [
        bucket,
        filename,
        objectKey,
        size,
        uploadedBy,
        groupId,
        versionNumber,
        parentVideoId,
      ],
    );

    const video = result.rows[0];

    // Log activity
    await logActivity(uploadedBy, "video_uploaded", "video", video.id, {
      filename,
      bucket,
      size,
      versionNumber: video.version_number,
      isNewVersion: !!parentVideoId,
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

    for (const video of storageVideos) {
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
    await syncBucketVideos(bucket);

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

// Get all versions of a video (version history)
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
    ];

    if (!validStatuses.includes(status)) {
      throw new Error("Invalid status");
    }

    // Get current status
    const current = await pool().query(
      "SELECT status, version_group_id FROM videos WHERE id = $1",
      [id],
    );
    const oldStatus = current.rows[0]?.status;
    const versionGroupId = current.rows[0]?.version_group_id;

    const result = await pool().query(
      "UPDATE videos SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
      [status, id],
    );

    if (result.rows.length === 0) {
      return null;
    }

    // If approved, move old versions to backup
    if (status === "Approved" && versionGroupId) {
      await archiveOldVersions(versionGroupId, id);
    }

    // Log activity
    if (userId) {
      await logActivity(userId, "status_changed", "video", id, {
        oldStatus,
        newStatus: status,
      });
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error updating video status:", error);
    throw error;
  }
}

// Archive old versions when a video is approved
async function archiveOldVersions(versionGroupId, approvedVideoId) {
  try {
    // Get all non-active versions in the group (excluding the approved one)
    const oldVersions = await pool().query(
      `SELECT * FROM videos
       WHERE version_group_id = $1 AND id != $2 AND is_active_version = FALSE`,
      [versionGroupId, approvedVideoId],
    );

    for (const video of oldVersions.rows) {
      // Insert into deleted_videos backup
      await pool().query(
        `INSERT INTO deleted_videos (original_video_id, version_group_id, version_number, bucket, filename, object_key, size, status, hls_ready, hls_path, uploaded_by, uploaded_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          video.id,
          video.version_group_id,
          video.version_number,
          video.bucket,
          video.filename,
          video.object_key,
          video.size,
          video.status,
          video.hls_ready,
          video.hls_path,
          video.uploaded_by,
          video.uploaded_at,
          video.created_at,
        ],
      );

      // Delete from videos table
      await pool().query("DELETE FROM videos WHERE id = $1", [video.id]);
    }

    console.log(
      `Archived ${oldVersions.rows.length} old version(s) for group ${versionGroupId}`,
    );
  } catch (error) {
    console.error("Error archiving old versions:", error);
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
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, FALSE)`,
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

    // Delete from videos
    await pool().query("DELETE FROM videos WHERE id = $1", [videoId]);

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
