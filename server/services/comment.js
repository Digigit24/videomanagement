import { getPool } from '../db/index.js';

export async function createComment(videoId, userId, content, videoTimestamp = null, replyTo = null) {
  try {
    const result = await getPool().query(
      `INSERT INTO comments (video_id, user_id, content, video_timestamp, reply_to)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [videoId, userId, content, videoTimestamp, replyTo]
    );

    // Fetch with user info
    const comment = await getPool().query(
      `SELECT c.*, u.name as user_name, u.email as user_email,
              rc.content as reply_content, rc.user_id as reply_user_id,
              ru.name as reply_user_name
       FROM comments c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN comments rc ON c.reply_to = rc.id
       LEFT JOIN users ru ON rc.user_id = ru.id
       WHERE c.id = $1`,
      [result.rows[0].id]
    );

    return comment.rows[0];
  } catch (error) {
    console.error('Error creating comment:', error);
    throw error;
  }
}

export async function getVideoComments(videoId) {
  try {
    const result = await getPool().query(
      `SELECT c.*, u.name as user_name, u.email as user_email,
              rc.content as reply_content, rc.user_id as reply_user_id,
              ru.name as reply_user_name
       FROM comments c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN comments rc ON c.reply_to = rc.id
       LEFT JOIN users ru ON rc.user_id = ru.id
       WHERE c.video_id = $1
       ORDER BY c.created_at ASC`,
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

export async function updateCommentMarkerStatus(commentId, markerStatus) {
  try {
    const result = await getPool().query(
      `UPDATE comments SET marker_status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [markerStatus, commentId]
    );

    if (result.rows.length === 0) return null;

    const comment = await getPool().query(
      `SELECT c.*, u.name as user_name, u.email as user_email
       FROM comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.id = $1`,
      [commentId]
    );

    return comment.rows[0];
  } catch (error) {
    console.error('Error updating marker status:', error);
    throw error;
  }
}
