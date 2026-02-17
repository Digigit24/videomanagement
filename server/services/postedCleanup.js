import { getPool } from "../db/index.js";
import { getS3Client, resolveBucket } from "./storage.js";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const CLEANUP_DAYS = 5;

/**
 * Find posted videos that have had no comments or timestamp feedback
 * for 5 days since being marked as "Posted", and delete them from S3.
 * The video record is removed but the workspace_video_stats entry persists
 * so historical posted counts remain accurate.
 */
export async function cleanupStalePostedVideos() {
  const pool = getPool();

  try {
    // Find videos with status "Posted" and posted_at older than 5 days
    const staleVideos = await pool.query(
      `SELECT v.id, v.bucket, v.object_key, v.filename, v.hls_path, v.posted_at
       FROM videos v
       WHERE v.status = 'Posted'
         AND v.posted_at IS NOT NULL
         AND v.posted_at < NOW() - INTERVAL '${CLEANUP_DAYS} days'
         AND v.is_active_version = TRUE`,
    );

    if (staleVideos.rows.length === 0) return 0;

    let cleaned = 0;

    for (const video of staleVideos.rows) {
      // Check if the video has ANY comments or reviews in the last 5 days
      const recentFeedback = await pool.query(
        `SELECT COUNT(*) as count FROM (
          SELECT id FROM comments WHERE video_id = $1 AND created_at > $2
          UNION ALL
          SELECT id FROM video_reviews WHERE video_id = $1 AND created_at > $2
        ) feedback`,
        [video.id, video.posted_at],
      );

      const feedbackCount = parseInt(recentFeedback.rows[0].count, 10);

      if (feedbackCount > 0) {
        // Has feedback, skip this video
        continue;
      }

      console.log(
        `Auto-cleanup: Removing stale posted video "${video.filename}" (${video.id}) from S3`,
      );

      // Delete from S3
      try {
        await deleteVideoFromS3(video.bucket, video.object_key, video.id);
      } catch (s3Err) {
        console.error(
          `Failed to delete S3 objects for video ${video.id}:`,
          s3Err,
        );
        // Continue to delete DB record even if S3 fails
      }

      // Delete from DB (comments cascade via ON DELETE CASCADE)
      await pool.query("DELETE FROM videos WHERE id = $1", [video.id]);

      cleaned++;
    }

    if (cleaned > 0) {
      console.log(
        `✓ Auto-cleanup: Removed ${cleaned} stale posted video(s) from S3`,
      );
    }

    return cleaned;
  } catch (error) {
    console.error("Error in posted video cleanup:", error);
    return 0;
  }
}

async function deleteVideoFromS3(bucketName, objectKey, videoId) {
  const { bucket } = resolveBucket(bucketName);
  const s3 = getS3Client();

  const keysToDelete = [{ Key: objectKey }];

  // Also delete HLS files if they exist
  try {
    const hlsPrefix = `hls/${videoId}/`;
    let continuationToken;
    do {
      const listCmd = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: hlsPrefix,
        ContinuationToken: continuationToken,
      });

      const listRes = await s3.send(listCmd);
      if (listRes.Contents) {
        for (const obj of listRes.Contents) {
          keysToDelete.push({ Key: obj.Key });
        }
      }
      continuationToken = listRes.NextContinuationToken;
    } while (continuationToken);
  } catch (err) {
    // HLS files may not exist, that's ok
  }

  if (keysToDelete.length > 0) {
    // Delete in batches of 1000 (S3 limit)
    for (let i = 0; i < keysToDelete.length; i += 1000) {
      const batch = keysToDelete.slice(i, i + 1000);
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch },
        }),
      );
    }
  }
}

/**
 * Start the periodic cleanup scheduler.
 * Runs every 6 hours.
 */
export function startPostedVideoCleanup() {
  // Run once on startup (delayed 30s to let DB init finish)
  setTimeout(() => {
    cleanupStalePostedVideos().catch(console.error);
  }, 30000);

  // Then run every 6 hours
  setInterval(
    () => {
      cleanupStalePostedVideos().catch(console.error);
    },
    6 * 60 * 60 * 1000,
  );
}
