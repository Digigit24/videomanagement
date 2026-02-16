import { getPool } from '../db/index.js';

export async function recordView(videoId, userId) {
  try {
    await getPool().query(
      `INSERT INTO video_views (video_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (video_id, user_id) DO UPDATE SET viewed_at = CURRENT_TIMESTAMP`,
      [videoId, userId]
    );
  } catch (error) {
    console.error('Error recording view:', error);
  }
}

export async function getVideoViewers(videoId) {
  try {
    const result = await getPool().query(
      `SELECT vv.viewed_at, u.id as user_id, u.name, u.email
       FROM video_views vv
       JOIN users u ON vv.user_id = u.id
       WHERE vv.video_id = $1
       ORDER BY vv.viewed_at DESC`,
      [videoId]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting video viewers:', error);
    throw error;
  }
}
