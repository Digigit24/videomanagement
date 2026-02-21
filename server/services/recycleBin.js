import { getPool } from "../db/index.js";
import { getS3Client, resolveBucket } from "./storage.js";
import { ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

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

      // Delete S3 content
      await deleteS3Content(ws.bucket);

      // Delete from DB (Cascade should handle members/invitations if configured, but let's check schema)
      // Schema has ON DELETE CASCADE for workspace_members and invitations.
      await getPool().query("DELETE FROM workspaces WHERE id = $1", [ws.id]);
    }

    // 2. Permanently delete users
    const expiredUsers = await getPool().query(
      "SELECT * FROM users WHERE deleted_at < NOW() - INTERVAL '3 days'",
    );

    for (const user of expiredUsers.rows) {
      console.log(`Permanently deleting user: ${user.email}`);
      await getPool().query("DELETE FROM users WHERE id = $1", [user.id]);
    }
  } catch (error) {
    console.error("Error in recycle bin cleanup:", error);
  }
}

// Clear entire recycle bin (permanently delete all items)
export async function clearEntireRecycleBin() {
  const pool = getPool();
  let deletedCounts = { workspaces: 0, users: 0, videos: 0 };

  // 1. Permanently delete all soft-deleted workspaces
  const deletedWorkspaces = await pool.query(
    "SELECT * FROM workspaces WHERE deleted_at IS NOT NULL",
  );
  for (const ws of deletedWorkspaces.rows) {
    await deleteS3Content(ws.bucket);
    await pool.query("DELETE FROM workspaces WHERE id = $1", [ws.id]);
  }
  deletedCounts.workspaces = deletedWorkspaces.rows.length;

  // 2. Permanently delete all soft-deleted users
  const deletedUsers = await pool.query(
    "SELECT * FROM users WHERE deleted_at IS NOT NULL",
  );
  for (const user of deletedUsers.rows) {
    await pool.query("DELETE FROM users WHERE id = $1", [user.id]);
  }
  deletedCounts.users = deletedUsers.rows.length;

  // 3. Permanently delete all deleted videos
  const result = await pool.query(
    "DELETE FROM deleted_videos RETURNING id",
  );
  deletedCounts.videos = result.rows.length;

  console.log(
    `Recycle bin cleared: ${deletedCounts.workspaces} workspace(s), ${deletedCounts.users} user(s), ${deletedCounts.videos} video(s)`,
  );

  return deletedCounts;
}
