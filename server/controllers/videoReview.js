import {
  createReview,
  getVideoReviews,
  getVideoPublicInfo,
  getOrCreateShareToken,
  getShareToken,
  createReviewAttachment,
} from "../services/videoReview.js";
import { apiError } from "../utils/logger.js";
import { uploadToS3 } from "../services/upload.js";
import multer from "multer";

const reviewAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
}).single("attachment");

// === Share Token Endpoints ===

// Generate a share token for a video (authenticated)
// Only allowed when the video is fully processed (hls_ready=true) or is a photo
export async function generateShareToken(req, res) {
  try {
    const { videoId } = req.params;

    // Check if video is ready to be shared
    const video = await getVideoPublicInfo(videoId);
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Photos are always shareable. Videos require HLS processing to complete.
    const isPhoto = video.media_type === "photo";
    if (!isPhoto && !video.hls_ready) {
      return res.status(400).json({
        error: "Please wait until video processing completes before sharing.",
      });
    }

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
  reviewAttachmentUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const { videoId } = req.params;
      const { reviewerName, content, replyTo } = req.body;

      if (!reviewerName || !reviewerName.trim()) {
        return res.status(400).json({ error: "Reviewer name is required" });
      }

      if (!content && !req.file) {
        return res
          .status(400)
          .json({ error: "Content or attachment is required" });
      }

      // Verify the video exists
      const video = await getVideoPublicInfo(videoId);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }

      const review = await createReview(
        videoId,
        reviewerName.trim(),
        content?.trim() || "",
        replyTo || null,
      );

      if (req.file) {
        const objectKey = `review-attachments/${videoId}/${Date.now()}-${req.file.originalname}`;

        await uploadToS3(
          video.bucket,
          objectKey,
          req.file.buffer,
          req.file.mimetype,
        );

        await createReviewAttachment(
          review.id,
          videoId,
          req.file.originalname,
          objectKey,
          req.file.size,
          req.file.mimetype,
        );

        // Add attachment info to review object for response
        review.attachment = {
          id: "temp-id",
          filename: req.file.originalname,
          size: req.file.size,
          content_type: req.file.mimetype,
          url: `/api/stream-attachment/${video.bucket}/${objectKey}`,
        };
      }

      // Notify workspace members about new client review
      try {
        if (video.bucket) {
          const { getWorkspaceByBucket } =
            await import("../services/workspace.js");
          const { notifyWorkspaceMembers } =
            await import("../services/notification.js");
          const workspace = await getWorkspaceByBucket(video.bucket);
          if (workspace) {
            const truncated = (content || "Sent an attachment").substring(
              0,
              60,
            );
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
  });
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
