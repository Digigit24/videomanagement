import { getPool } from '../db/index.js';

export async function logActivity(userId, action, entityType, entityId, details = {}) {
  try {
    await getPool().query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [userId, action, entityType, entityId, JSON.stringify(details)]
    );
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}

export async function getActivities(limit = 50, entityType = null) {
  try {
    let query = `
      SELECT a.*, u.name as user_name, u.email as user_email
      FROM activity_logs a
      LEFT JOIN users u ON a.user_id = u.id
    `;

    const params = [];

    if (entityType) {
      query += ' WHERE a.entity_type = $1';
      params.push(entityType);
    }

    query += ' ORDER BY a.created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await getPool().query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Error getting activities:', error);
    throw error;
  }
}

export async function getUserActivities(userId, limit = 50) {
  try {
    const result = await getPool().query(
      `SELECT a.*, u.name as user_name, u.email as user_email
       FROM activity_logs a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.user_id = $1
       ORDER BY a.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting user activities:', error);
    throw error;
  }
}
