import { getPool } from "../db/index.js";

export async function createFolder(workspaceId, name, createdBy) {
  const result = await getPool().query(
    `INSERT INTO folders (workspace_id, name, created_by)
     VALUES ($1, $2, $3) RETURNING *`,
    [workspaceId, name, createdBy],
  );
  return result.rows[0];
}

export async function getFolders(workspaceId) {
  const result = await getPool().query(
    `SELECT f.*, u.name as created_by_name,
       (SELECT COUNT(*) FROM videos v WHERE v.folder_id = f.id AND v.is_active_version = TRUE) as media_count
     FROM folders f
     LEFT JOIN users u ON f.created_by = u.id
     WHERE f.workspace_id = $1
     ORDER BY f.created_at DESC`,
    [workspaceId],
  );
  return result.rows;
}

export async function getFolderById(id) {
  const result = await getPool().query(
    `SELECT f.*, w.bucket as workspace_bucket
     FROM folders f
     JOIN workspaces w ON f.workspace_id = w.id
     WHERE f.id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

export async function updateFolder(id, name) {
  const result = await getPool().query(
    `UPDATE folders SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
    [name, id],
  );
  return result.rows[0] || null;
}

export async function deleteFolder(id) {
  // Set folder_id to null on all videos in this folder before deleting
  await getPool().query(
    `UPDATE videos SET folder_id = NULL WHERE folder_id = $1`,
    [id],
  );
  const result = await getPool().query(
    `DELETE FROM folders WHERE id = $1 RETURNING *`,
    [id],
  );
  return result.rows[0] || null;
}
