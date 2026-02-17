import { getPool } from "../db/index.js";
import crypto from "crypto";

// === Share Tokens ===

export async function createShareToken(videoId, createdBy) {
  const token = crypto.randomBytes(32).toString("hex");
  const result = await getPool().query(
    `INSERT INTO video_share_tokens (video_id, token, created_by)
     VALUES ($1, $2, $3) RETURNING *`,
    [videoId, token, createdBy],
  );
  return result.rows[0];
}

export async function getShareToken(token) {
  const result = await getPool().query(
    `SELECT vst.*, v.bucket, v.filename, v.hls_ready, v.hls_path, v.size, v.status
     FROM video_share_tokens vst
     JOIN videos v ON vst.video_id = v.id
     WHERE vst.token = $1 AND vst.active = true`,
    [token],
  );
  return result.rows[0] || null;
}

export async function getOrCreateShareToken(videoId, createdBy) {
  // Check if an active token already exists for this video
  const existing = await getPool().query(
    `SELECT * FROM video_share_tokens WHERE video_id = $1 AND active = true LIMIT 1`,
    [videoId],
  );
  if (existing.rows[0]) return existing.rows[0];
  return createShareToken(videoId, createdBy);
}

// === Video Reviews ===

export async function createReview(videoId, reviewerName, content, replyTo) {
  const result = await getPool().query(
    `INSERT INTO video_reviews (video_id, reviewer_name, content, reply_to)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [videoId, reviewerName, content, replyTo || null],
  );

  // Fetch with reply info
  const review = await getPool().query(
    `SELECT r.*,
            rr.content as reply_content,
            rr.reviewer_name as reply_reviewer_name
     FROM video_reviews r
     LEFT JOIN video_reviews rr ON r.reply_to = rr.id
     WHERE r.id = $1`,
    [result.rows[0].id],
  );

  return review.rows[0];
}

export async function getVideoReviews(videoId) {
  const result = await getPool().query(
    `SELECT r.*,
            rr.content as reply_content,
            rr.reviewer_name as reply_reviewer_name
     FROM video_reviews r
     LEFT JOIN video_reviews rr ON r.reply_to = rr.id
     WHERE r.video_id = $1
     ORDER BY r.created_at ASC`,
    [videoId],
  );
  return result.rows;
}

// Get video info for public pages (by video ID, no auth needed if share token valid)
export async function getVideoPublicInfo(videoId) {
  const result = await getPool().query(
    `SELECT id, bucket, filename, size, status, hls_ready, hls_path, created_at, uploaded_at
     FROM videos WHERE id = $1`,
    [videoId],
  );
  return result.rows[0] || null;
}
