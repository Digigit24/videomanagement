import { getPool } from "../db/index.js";

export async function createWorkspace(
  bucket,
  clientName,
  clientLogo,
  createdBy,
) {
  // Check if bucket name already exists (including deleted ones)
  const existing = await getPool().query(
    "SELECT id FROM workspaces WHERE bucket = $1",
    [bucket],
  );

  if (existing.rows.length > 0) {
    throw new Error(
      `A workspace with bucket name "${bucket}" already exists. Please use a different client name.`,
    );
  }

  const result = await getPool().query(
    `INSERT INTO workspaces (bucket, client_name, client_logo, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [bucket, clientName, clientLogo, createdBy],
  );
  return result.rows[0];
}

export async function getWorkspaces() {
  const result = await getPool().query(
    `SELECT w.*, u.name as created_by_name,
            (SELECT COUNT(*) FROM videos v WHERE v.bucket = w.bucket AND v.is_active_version = TRUE) as video_count,
            (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) as member_count
     FROM workspaces w
     LEFT JOIN users u ON w.created_by = u.id
     WHERE w.deleted_at IS NULL
     ORDER BY w.created_at DESC`,
  );
  return result.rows;
}

export async function getWorkspaceByBucket(bucket) {
  const result = await getPool().query(
    "SELECT * FROM workspaces WHERE bucket = $1 AND deleted_at IS NULL",
    [bucket],
  );
  return result.rows[0] || null;
}

export async function getWorkspaceById(id) {
  const result = await getPool().query(
    "SELECT * FROM workspaces WHERE id = $1 AND deleted_at IS NULL",
    [id],
  );
  return result.rows[0] || null;
}

export async function updateWorkspace(id, clientName, clientLogo) {
  const result = await getPool().query(
    `UPDATE workspaces SET client_name = $1, client_logo = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 RETURNING *`,
    [clientName, clientLogo, id],
  );
  return result.rows[0] || null;
}

export async function addWorkspaceMember(workspaceId, userId) {
  await getPool().query(
    `INSERT INTO workspace_members (workspace_id, user_id)
     VALUES ($1, $2) ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspaceId, userId],
  );
}

export async function removeWorkspaceMember(workspaceId, userId) {
  await getPool().query(
    "DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    [workspaceId, userId],
  );
}

export async function getWorkspaceMembers(workspaceId) {
  const result = await getPool().query(
    `SELECT u.id, u.name, u.email, u.role, u.avatar_url, wm.joined_at
     FROM workspace_members wm
     JOIN users u ON wm.user_id = u.id
     WHERE wm.workspace_id = $1
     ORDER BY wm.joined_at DESC`,
    [workspaceId],
  );
  return result.rows;
}

export async function getUserWorkspaces(userId, userRole) {
  // Only admin sees all workspaces automatically
  if (userRole === "admin") {
    return getWorkspaces();
  }

  // Client and member only see workspaces they belong to
  const result = await getPool().query(
    `SELECT w.*, u.name as created_by_name,
            (SELECT COUNT(*) FROM videos v WHERE v.bucket = w.bucket AND v.is_active_version = TRUE) as video_count,
            (SELECT COUNT(*) FROM workspace_members wm2 WHERE wm2.workspace_id = w.id) as member_count
     FROM workspaces w
     JOIN workspace_members wm ON w.id = wm.workspace_id
     LEFT JOIN users u ON w.created_by = u.id
     WHERE wm.user_id = $1 AND w.deleted_at IS NULL
     ORDER BY w.created_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function deleteWorkspace(id) {
  const result = await getPool().query(
    "DELETE FROM workspaces WHERE id = $1 RETURNING *",
    [id],
  );
  return result.rows[0];
}

export async function getAnyWorkspaceByBucket(bucket) {
  const result = await getPool().query(
    "SELECT * FROM workspaces WHERE bucket = $1",
    [bucket],
  );
  return result.rows[0];
}
