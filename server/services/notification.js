import { getPool } from "../db/index.js";

// Create a notification for a specific user
export async function createNotification(
  userId,
  type,
  title,
  message,
  workspaceId = null,
  entityType = null,
  entityId = null,
) {
  try {
    const result = await getPool().query(
      `INSERT INTO notifications (user_id, type, title, message, workspace_id, entity_type, entity_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, type, title, message, workspaceId, entityType, entityId],
    );
    return result.rows[0];
  } catch (error) {
    console.error("Error creating notification:", error);
  }
}

// Notify all members of a workspace
export async function notifyWorkspaceMembers(
  workspaceId,
  excludeUserId,
  type,
  title,
  message,
  entityType = null,
  entityId = null,
) {
  try {
    const members = await getPool().query(
      `SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND user_id != $2`,
      [workspaceId, excludeUserId],
    );

    // Also notify org members (admin, editor, PM, SM) who may not be explicit members
    const orgMembers = await getPool().query(
      `SELECT id FROM users WHERE is_org_member = TRUE AND id != $1
       AND id NOT IN (SELECT user_id FROM workspace_members WHERE workspace_id = $2)`,
      [excludeUserId, workspaceId],
    );

    const allUserIds = [
      ...members.rows.map((r) => r.user_id),
      ...orgMembers.rows.map((r) => r.id),
    ];

    const unique = [...new Set(allUserIds)];

    for (const userId of unique) {
      await createNotification(
        userId,
        type,
        title,
        message,
        workspaceId,
        entityType,
        entityId,
      );
    }

    return unique.length;
  } catch (error) {
    console.error("Error notifying workspace members:", error);
  }
}

// Get notifications for a user (unread first, then recent)
export async function getUserNotifications(userId, limit = 50) {
  try {
    const result = await getPool().query(
      `SELECT n.*, w.client_name as workspace_name, w.bucket as workspace_bucket
       FROM notifications n
       LEFT JOIN workspaces w ON n.workspace_id = w.id
       WHERE n.user_id = $1
       ORDER BY n.seen ASC, n.created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return result.rows;
  } catch (error) {
    console.error("Error getting notifications:", error);
    throw error;
  }
}

// Get unread count
export async function getUnreadCount(userId) {
  try {
    const result = await getPool().query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND seen = FALSE`,
      [userId],
    );
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error("Error getting unread count:", error);
    return 0;
  }
}

// Mark one notification as seen
export async function markAsSeen(notificationId, userId) {
  try {
    await getPool().query(
      `UPDATE notifications SET seen = TRUE WHERE id = $1 AND user_id = $2`,
      [notificationId, userId],
    );
  } catch (error) {
    console.error("Error marking notification as seen:", error);
  }
}

// Mark all notifications as seen for a user
export async function markAllAsSeen(userId) {
  try {
    await getPool().query(
      `UPDATE notifications SET seen = TRUE WHERE user_id = $1 AND seen = FALSE`,
      [userId],
    );
  } catch (error) {
    console.error("Error marking all notifications as seen:", error);
  }
}
