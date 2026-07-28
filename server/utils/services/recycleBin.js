import { getPool } from "../db/index.js";
import {
  getS3Client,
  resolveBucket,
  deleteS3Object,
  deleteS3Prefix,
} from "./storage.js";
import { ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
// The exact service the working "Delete Forever" button uses
// (routes: DELETE /deleted-video/:id/permanent -> controllers/video.js).
import { permanentlyDeleteVideo } from "./video.js";

// deleted_videos has no media_type column, so photos are identified by extension.
const PHOTO_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".svg",
];

function isPhoto(filename = "") {
  const lower = String(filename).toLowerCase();
  return PHOTO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * users(id) references that this module clears itself before deleting a user.
 * These are incidental bookkeeping rows, not user-authored content.
 * Everything else that RESTRICTs is treated as a reason to KEEP the user.
 */
const CLEARABLE_USER_REFS = new Set(["folders.created_by", "video_views.user_id"]);

// Friendly labels for the skip reason shown to the admin.
const REF_LABELS = {
  videos: "active videos",
  deleted_videos: "recycle-bin videos",
  comments: "comments",
  chat_messages: "chat messages",
  activity_logs: "activity log entries",
  workspaces: "workspaces they created",
  invitations: "invitations they created",
  video_share_tokens: "share links they created",
  folder_share_tokens: "folder share links they created",
  calendar_notes: "calendar notes",
};

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Find every rows-still-reference-this-user situation that would make
 * `DELETE FROM users` raise a foreign-key error.
 *
 * The FK list is read from the Postgres catalog rather than hardcoded, so a
 * table added by a future migration automatically causes the user to be kept
 * instead of blowing up the whole clear operation. Only NO ACTION / RESTRICT
 * constraints matter — ON DELETE CASCADE and SET NULL resolve themselves.
 */
async function getBlockingUserReferences(client, userId) {
  const { rows: constraints } = await client.query(`
    SELECT src.relname AS table_name, att.attname AS column_name
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_class tgt ON tgt.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = src.relnamespace
    JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND tgt.relname = 'users'
      AND n.nspname = ANY (current_schemas(false))
      AND c.confdeltype IN ('a', 'r')
      AND array_length(c.conkey, 1) = 1
  `);

  const blocking = [];
  for (const fk of constraints) {
    const key = `${fk.table_name}.${fk.column_name}`;
    if (CLEARABLE_USER_REFS.has(key)) continue;
    if (!SAFE_IDENTIFIER.test(fk.table_name) || !SAFE_IDENTIFIER.test(fk.column_name)) {
      continue;
    }
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM "${fk.table_name}" WHERE "${fk.column_name}" = $1`,
      [userId],
    );
    if (rows[0].count > 0) {
      blocking.push({
        table: fk.table_name,
        column: fk.column_name,
        count: rows[0].count,
      });
    }
  }
  return blocking;
}

function describeBlockingRefs(blocking) {
  return blocking
    .map((ref) => `${REF_LABELS[ref.table] || ref.table} (${ref.count})`)
    .join(", ");
}

/**
 * Permanently delete ONE recycle-bin user, the same way the media flow deletes
 * one item at a time. Returns { deleted: false, reason } instead of throwing
 * when the user is still referenced, so a single un-deletable user can never
 * abort a bulk clear. There is no broad "DELETE FROM users WHERE deleted_at
 * IS NOT NULL" anywhere: every deletion is per-user and pre-checked.
 */
export async function permanentlyDeleteUser(userId) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const blocking = await getBlockingUserReferences(client, userId);
    if (blocking.length > 0) {
      await client.query("ROLLBACK");
      return { deleted: false, reason: describeBlockingRefs(blocking) };
    }

    // Incidental references we are willing to clear.
    await client.query(
      "UPDATE folders SET created_by = NULL WHERE created_by = $1",
      [userId],
    );
    await client.query("DELETE FROM video_views WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM users WHERE id = $1", [userId]);

    await client.query("COMMIT");
    return { deleted: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Best-effort S3 cleanup for one recycle-bin media row (original + HLS ladder).
 * Never throws: an orphaned object is recoverable, a half-deleted DB is not.
 */
async function deleteRecycleBinMediaObjects(item) {
  const { bucket: physicalBucket } = resolveBucket(item.bucket);

  if (item.object_key) {
    // Guard against a live video that happens to point at the same object.
    const live = await getPool().query(
      "SELECT 1 FROM videos WHERE bucket = $1 AND object_key = $2 LIMIT 1",
      [item.bucket, item.object_key],
    );
    if (live.rows.length === 0) {
      try {
        await deleteS3Object(physicalBucket, item.object_key);
      } catch (e) {
        console.warn(
          `[RecycleBin] S3 delete failed for ${item.object_key}: ${e.message}`,
        );
      }
    }
  }

  if (item.hls_path) {
    const hlsDir = item.hls_path.replace(/\/master\.m3u8$/, "");
    try {
      await deleteS3Prefix(physicalBucket, `${hlsDir}/`);
    } catch (e) {
      console.warn(`[RecycleBin] S3 HLS cleanup failed for ${hlsDir}: ${e.message}`);
    }
  }
}

// Soft delete workspace
export async function softDeleteWorkspace(id) {
  const result = await getPool().query(
    "UPDATE workspaces SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
    [id],
  );
  return result.rows[0];
}

// Soft delete user
export async function softDeleteUser(id) {
  const result = await getPool().query(
    "UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
    [id],
  );
  return result.rows[0];
}

// Restore workspace
export async function restoreWorkspace(id) {
  const result = await getPool().query(
    "UPDATE workspaces SET deleted_at = NULL WHERE id = $1 RETURNING *",
    [id],
  );
  return result.rows[0];
}

// Restore user
export async function restoreUser(id) {
  const result = await getPool().query(
    "UPDATE users SET deleted_at = NULL WHERE id = $1 RETURNING *",
    [id],
  );
  return result.rows[0];
}

// Get deleted workspaces
export async function getDeletedWorkspaces() {
  const result = await getPool().query(
    "SELECT * FROM workspaces WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
  );
  return result.rows;
}

// Get deleted users
export async function getDeletedUsers() {
  const result = await getPool().query(
    "SELECT * FROM users WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
  );
  return result.rows;
}

// Empty and delete S3 folder/bucket
async function deleteS3Content(bucketName) {
  const { bucket, prefix } = resolveBucket(bucketName);
  const s3 = getS3Client();

  try {
    let continuationToken;
    do {
      const listCmd = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken,
      });

      const listRes = await s3.send(listCmd);

      if (listRes.Contents && listRes.Contents.length > 0) {
        const deleteParams = {
          Bucket: bucket,
          Delete: {
            Objects: listRes.Contents.map((obj) => ({ Key: obj.Key })),
          },
        };
        await s3.send(new DeleteObjectsCommand(deleteParams));
      }

      continuationToken = listRes.NextContinuationToken;
    } while (continuationToken);

    console.log(`✓ Cleaned up S3 content for ${bucketName}`);
  } catch (error) {
    console.error(`Error cleaning up S3 for ${bucketName}:`, error);
    // Continue even if S3 cleanup fails, to ensure DB consistency?
    // Or throw? For now log error but allow DB delete to proceed or maybe retry.
  }
}

// Process permanent deletions (Cron Job Logic)
export async function processPermanentDeletions() {
  console.log("Running recycle bin cleanup...");

  try {
    // 1. Permanently delete workspaces
    const expiredWorkspaces = await getPool().query(
      "SELECT * FROM workspaces WHERE deleted_at < NOW() - INTERVAL '3 days'",
    );

    for (const ws of expiredWorkspaces.rows) {
      console.log(
        `Permanently deleting workspace: ${ws.client_name} (${ws.bucket})`,
      );

      // Delete S3 content for workspace prefix
      await deleteS3Content(ws.bucket);

      // Also clean up individual video HLS directories and originals
      const videos = await getPool().query(
        "SELECT object_key, hls_path, thumbnail_key FROM videos WHERE bucket = $1",
        [ws.bucket],
      );
      for (const v of videos.rows) {
        try {
          if (v.hls_path) {
            const hlsDir = v.hls_path.replace(/\/master\.m3u8$/, "");
            const { deleteS3Prefix } = await import("./storage.js");
            const { bucket: resolved } = resolveBucket(ws.bucket);
            await deleteS3Prefix(resolved, hlsDir);
          }
        } catch (e) {
          console.warn(`Failed to clean S3 for video ${v.object_key}:`, e.message);
        }
      }

      // Delete from DB (CASCADE handles members, invitations, folders)
      await getPool().query("DELETE FROM videos WHERE bucket = $1", [ws.bucket]);
      await getPool().query("DELETE FROM workspaces WHERE id = $1", [ws.id]);
    }

    // 2. Permanently delete users
    const expiredUsers = await getPool().query(
      "SELECT * FROM users WHERE deleted_at < NOW() - INTERVAL '3 days'",
    );

    for (const user of expiredUsers.rows) {
      // Same guarded per-user service the bulk clear uses, so the scheduled
      // cleanup cannot hit videos_uploaded_by_fkey either.
      try {
        const outcome = await permanentlyDeleteUser(user.id);
        if (outcome.deleted) {
          console.log(`Permanently deleted user: ${user.email}`);
        } else {
          console.log(
            `Keeping user ${user.email}: still referenced by ${outcome.reason}`,
          );
        }
      } catch (error) {
        console.error(
          `Failed to permanently delete user ${user.id}:`,
          error.message,
        );
      }
    }
  } catch (error) {
    console.error("Error in recycle bin cleanup:", error);
  }
}

/**
 * Clear the entire recycle bin, permanently.
 *
 * Dependency order matters: media rows and workspace content are removed
 * first, and users are only deleted last, once nothing references them.
 * A soft-deleted user who still owns active videos (or any other retained
 * content) is KEPT and reported, instead of raising
 * `videos_uploaded_by_fkey` and aborting the whole operation.
 *
 * Each item runs in its own transaction so one failure cannot roll back or
 * abort the rest — the caller gets a partial-success summary.
 */
export async function clearEntireRecycleBin() {
  const pool = getPool();
  const result = {
    videos: 0,
    photos: 0,
    workspaces: 0,
    users: 0,
    skippedUsers: 0,
    failed: 0,
    skipped: [],
  };

  // --- 1. Recycle-bin media (deleted_videos) -------------------------------
  // Note: the parent `videos` row is already gone at soft-delete time, so its
  // dependants (comments, views, share tokens, reviews) went with it via
  // ON DELETE CASCADE. deleted_videos.uploaded_by has no FK.
  const { rows: media } = await pool.query("SELECT id, bucket, filename, object_key, hls_path FROM deleted_videos");

  // Same service as the single-item "Delete Forever" action, one call per item,
  // in small batches so one failure never affects the others.
  const BATCH_SIZE = 10;
  for (let i = 0; i < media.length; i += BATCH_SIZE) {
    const batch = media.slice(i, i + BATCH_SIZE);
    const outcomes = await Promise.allSettled(
      batch.map((item) => permanentlyDeleteVideo(item.id)),
    );

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      if (outcomes[j].status !== "fulfilled") {
        result.failed++;
        result.skipped.push({
          type: "media",
          id: item.id,
          name: item.filename,
          reason: "could not be deleted",
        });
        console.error(
          `[RecycleBin] Failed to permanently delete media ${item.id} (${item.filename}):`,
          outcomes[j].reason?.message || outcomes[j].reason,
        );
        continue;
      }

      // Storage cleanup only after the row is definitively gone.
      await deleteRecycleBinMediaObjects(item);
      if (isPhoto(item.filename)) result.photos++;
      else result.videos++;
    }
  }

  // --- 2. Soft-deleted workspaces ------------------------------------------
  const { rows: workspaces } = await pool.query(
    "SELECT * FROM workspaces WHERE deleted_at IS NOT NULL",
  );
  for (const ws of workspaces) {
    await deleteS3Content(ws.bucket);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Removing the workspace's videos also removes their references to
      // users, which is what lets step 3 delete users cleanly.
      await client.query("DELETE FROM videos WHERE bucket = $1", [ws.bucket]);
      await client.query("DELETE FROM deleted_videos WHERE bucket = $1", [ws.bucket]);
      await client.query("DELETE FROM workspaces WHERE id = $1", [ws.id]);
      await client.query("COMMIT");
      result.workspaces++;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      result.failed++;
      result.skipped.push({
        type: "workspace",
        id: ws.id,
        name: ws.client_name || ws.bucket,
        reason: "could not be deleted",
      });
      console.error(
        `[RecycleBin] Failed to permanently delete workspace ${ws.id} (${ws.bucket}):`,
        error.message,
      );
    } finally {
      client.release();
    }
  }

  // --- 3. Soft-deleted users (last, once nothing references them) ----------
  const { rows: users } = await pool.query(
    "SELECT id, name, email FROM users WHERE deleted_at IS NOT NULL",
  );
  for (const user of users) {
    try {
      const outcome = await permanentlyDeleteUser(user.id);
      if (outcome.deleted) {
        result.users++;
      } else {
        result.skippedUsers++;
        result.skipped.push({
          type: "user",
          id: user.id,
          name: user.name || user.email,
          reason: outcome.reason,
        });
        console.log(
          `[RecycleBin] Keeping user ${user.email}: still referenced by ${outcome.reason}`,
        );
      }
    } catch (error) {
      result.failed++;
      result.skipped.push({
        type: "user",
        id: user.id,
        name: user.name || user.email,
        reason: "could not be deleted",
      });
      console.error(
        `[RecycleBin] Failed to permanently delete user ${user.id}:`,
        error.message,
      );
    }
  }

  console.log(
    `[RecycleBin] Cleared: ${result.videos} video(s), ${result.photos} photo(s), ` +
      `${result.workspaces} workspace(s), ${result.users} user(s) deleted; ` +
      `${result.skippedUsers} user(s) kept, ${result.failed} failure(s)`,
  );

  return result;
}
