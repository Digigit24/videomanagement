import pool from '../db/index.js';
import { listVideos as listStorageVideos } from './storage.js';
import { logActivity } from './activity.js';

export async function createVideo({ bucket, filename, objectKey, size, uploadedBy }) {
  try {
    const result = await pool().query(
      `INSERT INTO videos (bucket, filename, object_key, size, uploaded_by, uploaded_at, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [bucket, filename, objectKey, size, uploadedBy]
    );

    const video = result.rows[0];

    // Log activity
    await logActivity(uploadedBy, 'video_uploaded', 'video', video.id, {
      filename,
      bucket,
      size
    });

    return video;
  } catch (error) {
    console.error('Error creating video:', error);
    throw error;
  }
}

export async function syncBucketVideos(bucket) {
  try {
    const storageVideos = await listStorageVideos(bucket);

    for (const video of storageVideos) {
      await pool().query(
        `INSERT INTO videos (bucket, filename, object_key, size, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (bucket, object_key)
         DO UPDATE SET
           size = EXCLUDED.size,
           updated_at = CURRENT_TIMESTAMP`,
        [bucket, video.filename, video.object_key, video.size, video.last_modified]
      );
    }

    return storageVideos.length;
  } catch (error) {
    console.error('Error syncing videos:', error);
    throw error;
  }
}

export async function getVideos(bucket) {
  try {
    await syncBucketVideos(bucket);

    const result = await pool().query(
      `SELECT v.*, u.name as uploaded_by_name, u.email as uploaded_by_email
       FROM videos v
       LEFT JOIN users u ON v.uploaded_by = u.id
       WHERE v.bucket = $1
       ORDER BY v.created_at DESC`,
      [bucket]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting videos:', error);
    throw error;
  }
}

export async function getVideoById(id, bucket) {
  try {
    const result = await pool().query(
      `SELECT v.*, u.name as uploaded_by_name, u.email as uploaded_by_email
       FROM videos v
       LEFT JOIN users u ON v.uploaded_by = u.id
       WHERE v.id = $1 AND v.bucket = $2`,
      [id, bucket]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error getting video by ID:', error);
    throw error;
  }
}

export async function updateVideoStatus(id, status, userId) {
  try {
    const validStatuses = ['Draft', 'In Review', 'Approved', 'Published', 'Archived'];

    if (!validStatuses.includes(status)) {
      throw new Error('Invalid status');
    }

    // Get current status
    const current = await pool().query('SELECT status FROM videos WHERE id = $1', [id]);
    const oldStatus = current.rows[0]?.status;

    const result = await pool().query(
      'UPDATE videos SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Log activity
    if (userId) {
      await logActivity(userId, 'status_changed', 'video', id, {
        oldStatus,
        newStatus: status
      });
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error updating video status:', error);
    throw error;
  }
}
