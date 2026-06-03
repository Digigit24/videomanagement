import { getPool } from "../db/index.js";
import { apiError } from "../utils/logger.js";

/**
 * GET /workspace/:id/shoots
 * List all shoots for a workspace.
 */
export async function listShoots(req, res) {
  const { id } = req.params;
  try {
    const result = await getPool().query(
      `SELECT * FROM shoots WHERE workspace_id = $1 ORDER BY shoot_date ASC NULLS LAST, created_at DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to retrieve shoots." });
  }
}

/**
 * POST /workspace/:id/shoots
 * Create a new shoot entry.
 */
export async function addShoot(req, res) {
  const { id } = req.params;
  const { title, description, shoot_date, status } = req.body;

  if (!title || title.trim() === "") {
    return res.status(400).json({ error: "Shoot title is required." });
  }

  try {
    const result = await getPool().query(
      `INSERT INTO shoots (workspace_id, title, description, shoot_date, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        id,
        title.trim(),
        description ? description.trim() : "",
        shoot_date || null,
        status || "planned",
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to create shoot." });
  }
}

/**
 * PATCH /shoots/:id
 * Update an existing shoot's fields.
 */
export async function editShoot(req, res) {
  const { id } = req.params;
  const { title, description, shoot_date, status, workspace_id } = req.body;

  try {
    // Fetch current record first
    const current = await getPool().query(
      `SELECT * FROM shoots WHERE id = $1`,
      [id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: "Shoot not found." });
    }
    const row = current.rows[0];

    const result = await getPool().query(
      `UPDATE shoots
       SET title        = $1,
           description  = $2,
           shoot_date   = $3,
           status       = $4,
           workspace_id = $5,
           updated_at   = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        title !== undefined ? title.trim() : row.title,
        description !== undefined ? description.trim() : row.description,
        shoot_date !== undefined ? (shoot_date || null) : row.shoot_date,
        status !== undefined ? status : row.status,
        workspace_id !== undefined ? workspace_id : row.workspace_id,
        id,
      ]
    );
    res.json(result.rows[0]);
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update shoot." });
  }
}

/**
 * DELETE /shoots/:id
 * Permanently remove a shoot.
 */
export async function removeShoot(req, res) {
  const { id } = req.params;
  try {
    const result = await getPool().query(
      `DELETE FROM shoots WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Shoot not found." });
    }
    res.json({ success: true, deleted_id: result.rows[0].id });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to delete shoot." });
  }
}
