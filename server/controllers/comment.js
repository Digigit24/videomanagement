import { createComment, getVideoComments, deleteComment, updateCommentMarkerStatus } from '../services/comment.js';
import { logActivity } from '../services/activity.js';
import { apiError } from '../utils/logger.js';

export async function addComment(req, res) {
  try {
    const { videoId } = req.params;
    const { content, videoTimestamp, replyTo } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const comment = await createComment(videoId, req.user.id, content, videoTimestamp, replyTo || null);

    await logActivity(req.user.id, 'comment_added', 'video', videoId, {
      commentId: comment.id,
      timestamp: videoTimestamp
    });

    res.status(201).json({ comment });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
}

export async function getComments(req, res) {
  try {
    const { videoId } = req.params;
    const comments = await getVideoComments(videoId);
    res.json({ comments });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: 'Failed to get comments' });
  }
}

export async function removeComment(req, res) {
  try {
    const { commentId } = req.params;
    const comment = await deleteComment(commentId, req.user.id);

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found or unauthorized' });
    }

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
}

export async function updateMarkerStatus(req, res) {
  try {
    const { commentId } = req.params;
    const { markerStatus } = req.body;
    const userRole = req.user.role;

    // Only editor and admin can change marker status
    if (userRole !== 'editor' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Only editors and admins can update marker status' });
    }

    const validStatuses = ['pending', 'working', 'done'];
    if (!validStatuses.includes(markerStatus)) {
      return res.status(400).json({ error: 'Invalid marker status. Must be: pending, working, or done' });
    }

    const comment = await updateCommentMarkerStatus(commentId, markerStatus);

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    res.json({ comment });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: 'Failed to update marker status' });
  }
}
