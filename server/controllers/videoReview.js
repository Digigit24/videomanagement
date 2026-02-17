import {
  createReview,
  getVideoReviews,
  getVideoPublicInfo,
  getOrCreateShareToken,
  getShareToken,
} from "../services/videoReview.js";
import { apiError } from "../utils/logger.js";

// === Share Token Endpoints ===

// Generate a share token for a video (authenticated)
export async function generateShareToken(req, res) {
  try {
    const { videoId } = req.params;
    const token = await getOrCreateShareToken(videoId, req.user.id);
    res.json({ token: token.token, videoId });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to generate share token" });
  }
}

// Validate share token and return video info (public)
export async function validateShareToken(req, res) {
  try {
    const { token } = req.params;
    const data = await getShareToken(token);

    if (!data) {
      return res.status(404).json({ error: "Invalid or expired share link" });
    }

    res.json({
      video: {
        id: data.video_id,
        bucket: data.bucket,
        filename: data.filename,
        hls_ready: data.hls_ready,
        hls_path: data.hls_path,
        size: data.size,
        status: data.status,
      },
    });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to validate share token" });
  }
}

// === Public Video Info (by video ID) ===

export async function getPublicVideoInfo(req, res) {
  try {
    const { videoId } = req.params;
    const video = await getVideoPublicInfo(videoId);

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    res.json({ video });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get video info" });
  }
}

// === Review Endpoints ===

// Add a review (public - no auth needed, reviewer provides name)
export async function addReview(req, res) {
  try {
    const { videoId } = req.params;
    const { reviewerName, content, replyTo } = req.body;

    if (!reviewerName || !reviewerName.trim()) {
      return res.status(400).json({ error: "Reviewer name is required" });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Review content is required" });
    }

    // Verify the video exists
    const video = await getVideoPublicInfo(videoId);
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    const review = await createReview(
      videoId,
      reviewerName.trim(),
      content.trim(),
      replyTo || null,
    );

    // Notify workspace members about new client review
    try {
      if (video.bucket) {
        const { getWorkspaceByBucket } = await import(
          "../services/workspace.js"
        );
        const { notifyWorkspaceMembers } = await import(
          "../services/notification.js"
        );
        const workspace = await getWorkspaceByBucket(video.bucket);
        if (workspace) {
          const truncated = content.substring(0, 60);
          await notifyWorkspaceMembers(
            workspace.id,
            null, // No user ID for external reviewers
            "client_review",
            `Client Review — ${video.filename}`,
            `${reviewerName}: ${truncated}`,
            "video",
            videoId,
          );
        }
      }
    } catch (e) {
      console.error("Review notification error:", e);
    }

    res.status(201).json({ review });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to add review" });
  }
}

// Get reviews for a video (public)
export async function listReviews(req, res) {
  try {
    const { videoId } = req.params;
    const reviews = await getVideoReviews(videoId);
    res.json({ reviews });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get reviews" });
  }
}
