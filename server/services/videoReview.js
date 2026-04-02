import { getPool } from "../db/index.js";
import crypto from "crypto";
import { sanitizeText } from "../utils/sanitize.js";

// === Share Tokens ===

export async function createShareToken(videoId, createdBy, requireLogin = false) {
  const token = crypto.randomBytes(32).toString("hex");
  const result = await getPool().query(
    `INSERT INTO video_share_tokens (video_id, token, created_by, require_login)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [videoId, token, createdBy, requireLogin],
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

export async function getOrCreateShareToken(videoId, createdBy, requireLogin = false) {
  // Check if an active token already exists for this video
  const existing = await getPool().query(
    `SELECT * FROM video_share_tokens WHERE video_id = $1 AND active = true LIMIT 1`,
    [videoId],
  );
  if (existing.rows[0]) {
    // Update require_login if changed
    if (existing.rows[0].require_login !== requireLogin) {
      await getPool().query(
        `UPDATE video_share_tokens SET require_login = $1 WHERE id = $2`,
        [requireLogin, existing.rows[0].id],
      );
      existing.rows[0].require_login = requireLogin;
    }
    return existing.rows[0];
  }
  return createShareToken(videoId, createdBy, requireLogin);
}

// === Video Reviews ===

export async function createReview(videoId, reviewerName, content, replyTo) {
  const result = await getPool().query(
    `INSERT INTO video_reviews (video_id, reviewer_name, content, reply_to)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [videoId, sanitizeText(reviewerName), sanitizeText(content), replyTo || null],
  );

  // Fetch with reply info and attachment
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

export async function createReviewAttachment(
  reviewId,
  videoId,
  filename,
  objectKey,
  size,
  contentType,
) {
  try {
    await getPool().query(
      `INSERT INTO video_review_attachments (review_id, video_id, filename, object_key, size, content_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [reviewId, videoId, filename, objectKey, size, contentType],
    );
  } catch (error) {
    console.error("Error creating review attachment:", error);
    throw error;
  }
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

  const reviews = result.rows;
  if (reviews.length > 0) {
    const reviewIds = reviews.map((r) => r.id);
    const attachments = await getPool().query(
      `SELECT a.*, v.bucket 
       FROM video_review_attachments a
       JOIN videos v ON a.video_id = v.id
       WHERE a.review_id = ANY($1)`,
      [reviewIds],
    );

    const attachmentMap = {};
    attachments.rows.forEach((att) => {
      attachmentMap[att.review_id] = {
        id: att.id,
        filename: att.filename,
        size: att.size,
        content_type: att.content_type,
        url: `/api/stream-attachment/${att.bucket}/${att.object_key}`,
      };
    });

    reviews.forEach((r) => {
      if (attachmentMap[r.id]) {
        r.attachment = attachmentMap[r.id];
      }
    });
  }

  return reviews;
}

// Get video info for public pages (by video ID, no auth needed if share token valid)
export async function getVideoPublicInfo(videoId) {
  const result = await getPool().query(
    `SELECT id, bucket, filename, size, status, hls_ready, hls_path, media_type, processing_status, created_at, uploaded_at
     FROM videos WHERE id = $1`,
    [videoId],
  );
  return result.rows[0] || null;
}
