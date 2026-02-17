import {
  createComment,
  getVideoComments,
  deleteComment,
  updateCommentMarkerStatus,
} from "../services/comment.js";
import { logActivity } from "../services/activity.js";
import { apiError } from "../utils/logger.js";

import { uploadToS3 } from "../services/upload.js";
import { getBucketByVideoId } from "../services/video.js";
import { createChatAttachment } from "../services/comment.js";
import multer from "multer";

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
}).single("attachment");

export async function addComment(req, res) {
  attachmentUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const { videoId } = req.params;
      const { content, videoTimestamp, replyTo } = req.body;

      if (!content && !req.file) {
        return res
          .status(400)
          .json({ error: "Content or attachment is required" });
      }

      const comment = await createComment(
        videoId,
        req.user.id,
        content || "",
        videoTimestamp,
        replyTo || null,
      );

      if (req.file) {
        const bucket = await getBucketByVideoId(videoId);
        const objectKey = `chat-attachments/${videoId}/${Date.now()}-${req.file.originalname}`;

        await uploadToS3(bucket, objectKey, req.file.buffer, req.file.mimetype);

        await createChatAttachment(
          comment.id,
          videoId,
          req.file.originalname,
          objectKey,
          req.file.size,
          req.file.mimetype,
        );

        // Add attachment info to comment object for response
        comment.attachment = {
          filename: req.file.originalname,
          url: `/api/stream-attachment/${bucket}/${objectKey}`,
        };
      }

      await logActivity(req.user.id, "comment_added", "video", videoId, {
        commentId: comment.id,
        timestamp: videoTimestamp,
        hasAttachment: !!req.file,
      });

      // Notify workspace members about new comment
      try {
        const bucket = await getBucketByVideoId(videoId);
        if (bucket) {
          const { getWorkspaceByBucket } = await import("../services/workspace.js");
          const { notifyWorkspaceMembers } = await import("../services/notification.js");
          const workspace = await getWorkspaceByBucket(bucket);
          if (workspace) {
            const userName = req.user.name || req.user.email;
            const truncated = (content || "Sent an attachment").substring(0, 60);
            await notifyWorkspaceMembers(
              workspace.id,
              req.user.id,
              "comment_added",
              `New Comment — ${workspace.client_name}`,
              `${userName}: ${truncated}`,
              "video",
              videoId,
            );
          }
        }
      } catch (e) {
        console.error("Comment notification error:", e);
      }

      res.status(201).json({ comment });
    } catch (error) {
      apiError(req, error);
      res.status(500).json({ error: "Failed to add comment" });
    }
  });
}

export async function getComments(req, res) {
  try {
    const { videoId } = req.params;
    const comments = await getVideoComments(videoId);
    res.json({ comments });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get comments" });
  }
}

export async function removeComment(req, res) {
  try {
    const { commentId } = req.params;
    const comment = await deleteComment(commentId, req.user.id);

    if (!comment) {
      return res
        .status(404)
        .json({ error: "Comment not found or unauthorized" });
    }

    res.json({ message: "Comment deleted successfully" });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to delete comment" });
  }
}

export async function updateMarkerStatus(req, res) {
  try {
    const { commentId } = req.params;
    const { markerStatus } = req.body;
    const userRole = req.user.role;

    // video_editor, admin, and org members can change marker status
    const markerRoles = ["video_editor", "admin", "member", "project_manager", "social_media_manager"];
    if (!markerRoles.includes(userRole)) {
      return res
        .status(403)
        .json({ error: "You don't have permission to update marker status" });
    }

    const validStatuses = ["pending", "working", "done"];
    if (!validStatuses.includes(markerStatus)) {
      return res.status(400).json({
        error: "Invalid marker status. Must be: pending, working, or done",
      });
    }

    const comment = await updateCommentMarkerStatus(commentId, markerStatus);

    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    // Notify workspace members about marker status change
    try {
      const bucket = await getBucketByVideoId(comment.video_id);
      if (bucket) {
        const { getWorkspaceByBucket } = await import("../services/workspace.js");
        const { notifyWorkspaceMembers } = await import("../services/notification.js");
        const workspace = await getWorkspaceByBucket(bucket);
        if (workspace) {
          const userName = req.user.name || req.user.email;
          await notifyWorkspaceMembers(
            workspace.id,
            req.user.id,
            "marker_status_changed",
            `Timeline Update — ${workspace.client_name}`,
            `${userName} marked a timeline item as "${markerStatus}" in ${workspace.client_name}`,
            "workspace",
            workspace.id,
          );
        }
      }
    } catch (e) {
      console.error("Marker notification error:", e);
    }

    res.json({ comment });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update marker status" });
  }
}
