import { getPool } from "../db/index.js";

// Default permissions by role
const DEFAULT_PERMISSIONS = {
  admin: {
    can_upload: true,
    can_delete: true,
    can_change_status: true,
    can_change_video_status: true,
    can_add_member: true,
    can_remove_member: true,
    can_create_folder: true,
    can_delete_folder: true,
    can_manage_permissions: true,
  },
  project_manager: {
    can_upload: true,
    can_delete: true,
    can_change_status: true,
    can_change_video_status: true,
    can_add_member: true,
    can_remove_member: true,
    can_create_folder: true,
    can_delete_folder: true,
    can_manage_permissions: true,
  },
  social_media_manager: {
    can_upload: true,
    can_delete: true,
    can_change_status: true,
    can_change_video_status: true,
    can_add_member: true,
    can_remove_member: false,
    can_create_folder: true,
    can_delete_folder: true,
    can_manage_permissions: true,
  },
  video_editor: {
    can_upload: true,
    can_delete: true,
    can_change_status: false,
    can_change_video_status: false,
    can_add_member: false,
    can_remove_member: false,
    can_create_folder: true,
    can_delete_folder: false,
    can_manage_permissions: false,
  },
  videographer: {
    can_upload: true,
    can_delete: false,
    can_change_status: false,
    can_change_video_status: false,
    can_add_member: false,
    can_remove_member: false,
    can_create_folder: true,
    can_delete_folder: false,
    can_manage_permissions: false,
  },
  photo_editor: {
    can_upload: true,
    can_delete: true,
    can_change_status: false,
    can_change_video_status: false,
    can_add_member: false,
    can_remove_member: false,
    can_create_folder: true,
    can_delete_folder: false,
    can_manage_permissions: false,
  },
  client: {
    can_upload: false,
    can_delete: false,
    can_change_status: true,
    can_change_video_status: true,
    can_add_member: false,
    can_remove_member: false,
    can_create_folder: false,
    can_delete_folder: false,
    can_manage_permissions: false,
  },
  member: {
    can_upload: false,
    can_delete: false,
    can_change_status: false,
    can_change_video_status: false,
    can_add_member: false,
    can_remove_member: false,
    can_create_folder: false,
    can_delete_folder: false,
    can_manage_permissions: false,
  },
};

export function getDefaultPermissions(role) {
  return DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.member;
}

// Get user's permissions for a workspace (or create defaults if none exist)
export async function getWorkspacePermissions(workspaceId, userId) {
  const result = await getPool().query(
    `SELECT wp.*, u.role as user_role FROM workspace_permissions wp
     JOIN users u ON wp.user_id = u.id
     WHERE wp.workspace_id = $1 AND wp.user_id = $2`,
    [workspaceId, userId],
  );

  if (result.rows[0]) {
    return result.rows[0];
  }

  // No custom permissions set - return defaults based on role
  const userResult = await getPool().query(
    `SELECT role FROM users WHERE id = $1`,
    [userId],
  );
  const role = userResult.rows[0]?.role || "member";
  return { ...getDefaultPermissions(role), user_role: role, workspace_id: workspaceId, user_id: userId };
}

// Set permissions for a user in a workspace
export async function setWorkspacePermissions(workspaceId, userId, permissions) {
  const result = await getPool().query(
    `INSERT INTO workspace_permissions (workspace_id, user_id, can_upload, can_delete, can_change_status, can_change_video_status, can_add_member, can_remove_member, can_create_folder, can_delete_folder, can_manage_permissions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET
       can_upload = $3,
       can_delete = $4,
       can_change_status = $5,
       can_change_video_status = $6,
       can_add_member = $7,
       can_remove_member = $8,
       can_create_folder = $9,
       can_delete_folder = $10,
       can_manage_permissions = $11,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      workspaceId,
      userId,
      permissions.can_upload ?? false,
      permissions.can_delete ?? false,
      permissions.can_change_status ?? false,
      permissions.can_change_video_status ?? false,
      permissions.can_add_member ?? false,
      permissions.can_remove_member ?? false,
      permissions.can_create_folder ?? false,
      permissions.can_delete_folder ?? false,
      permissions.can_manage_permissions ?? false,
    ],
  );
  return result.rows[0];
}

// Get all permissions for a workspace (all members)
export async function getAllWorkspacePermissions(workspaceId) {
  const result = await getPool().query(
    `SELECT wp.*, u.name as user_name, u.email as user_email, u.role as user_role, u.avatar_url
     FROM workspace_permissions wp
     JOIN users u ON wp.user_id = u.id
     WHERE wp.workspace_id = $1
     ORDER BY u.name`,
    [workspaceId],
  );
  return result.rows;
}

// Initialize default permissions for a user when they join a workspace
export async function initializeDefaultPermissions(workspaceId, userId, role) {
  const defaults = getDefaultPermissions(role);
  return setWorkspacePermissions(workspaceId, userId, defaults);
}

// Check if user can perform an action in a workspace
export async function checkPermission(workspaceId, userId, permissionKey) {
  // Admin always has all permissions
  const userResult = await getPool().query(
    `SELECT role FROM users WHERE id = $1`,
    [userId],
  );
  if (userResult.rows[0]?.role === "admin") return true;

  const perms = await getWorkspacePermissions(workspaceId, userId);
  return !!perms[permissionKey];
}
