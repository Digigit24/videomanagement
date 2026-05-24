import { getPool } from "../db/index.js";

export async function getBookmarks(req, res) {
  try {
    const { workspaceId } = req.params;
    const pool = getPool();
    const result = await pool.query(
      "SELECT * FROM workspace_bookmarks WHERE workspace_id = $1 ORDER BY created_at ASC",
      [workspaceId]
    );
    res.json({ bookmarks: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch bookmarks" });
  }
}

export async function addBookmark(req, res) {
  try {
    const { workspaceId } = req.params;
    const { name, url } = req.body;
    if (!name?.trim() || !url?.trim()) {
      return res.status(400).json({ error: "name and url are required" });
    }
    const pool = getPool();
    const result = await pool.query(
      "INSERT INTO workspace_bookmarks (workspace_id, name, url) VALUES ($1, $2, $3) RETURNING *",
      [workspaceId, name.trim(), url.trim()]
    );
    res.status(201).json({ bookmark: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add bookmark" });
  }
}

export async function removeBookmark(req, res) {
  try {
    const { id } = req.params;
    const pool = getPool();
    const result = await pool.query(
      "DELETE FROM workspace_bookmarks WHERE id = $1 RETURNING id",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Bookmark not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete bookmark" });
  }
}
