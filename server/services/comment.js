import { getPool } from '../db/index.js';

export async function createComment(videoId, userId, content, videoTimestamp = null) {
  try {
    const result = await getPool().query(
      'INSERT INTO comments (video_id, user_id, content, video_timestamp) VALUES ($1, $2, $3, $4) RETURNING *',
      [videoId, userId, content, videoTimestamp]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Error creating comment:', error);
    throw error;
  }
}

export async function getVideoComments(videoId) {
  try {
    const result = await getPool().query(
      `SELECT c.*, u.name as user_name, u.email as user_email
       FROM comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.video_id = $1
       ORDER BY c.created_at DESC`,
      [videoId]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting comments:', error);
    throw error;
  }
}

export async function deleteComment(commentId, userId) {
  try {
    const result = await getPool().query(
      'DELETE FROM comments WHERE id = $1 AND user_id = $2 RETURNING *',
      [commentId, userId]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error('Error deleting comment:', error);
    throw error;
  }
}
