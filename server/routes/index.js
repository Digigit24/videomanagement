import express from 'express';
import { login } from '../controllers/auth.js';
import { getBuckets } from '../controllers/bucket.js';
import { listVideos, getVideo, updateStatus, streamVideo, uploadVideo } from '../controllers/video.js';
import { register, getUsers, getUser, getCurrentUser, deleteUser } from '../controllers/user.js';
import { addComment, getComments, removeComment, updateMarkerStatus } from '../controllers/comment.js';
import { listActivities, listUserActivities } from '../controllers/activity.js';
import { recordView, getVideoViewers } from '../services/views.js';
import { authenticate, authenticateStream, validateBucket } from '../middleware/auth.js';

const router = express.Router();

// Auth
router.post('/login', login);
router.post('/register', register);

// Users
router.get('/users', authenticate, getUsers);
router.get('/user/me', authenticate, getCurrentUser);
router.get('/user/:id', authenticate, getUser);
router.delete('/user/:id', authenticate, deleteUser);

// Buckets
router.get('/buckets', authenticate, getBuckets);

// Videos
router.get('/videos', authenticate, validateBucket, listVideos);
router.get('/video/:id', authenticate, validateBucket, getVideo);
router.patch('/video/:id/status', authenticate, updateStatus);
router.post('/upload', authenticate, validateBucket, uploadVideo);
router.get('/stream/:id', authenticateStream, validateBucket, streamVideo);

// Video views
router.post('/video/:videoId/view', authenticate, async (req, res) => {
  try {
    await recordView(req.params.videoId, req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record view' });
  }
});

router.get('/video/:videoId/viewers', authenticate, async (req, res) => {
  try {
    const viewers = await getVideoViewers(req.params.videoId);
    res.json({ viewers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get viewers' });
  }
});

// Comments
router.post('/video/:videoId/comments', authenticate, addComment);
router.get('/video/:videoId/comments', authenticate, getComments);
router.delete('/comment/:commentId', authenticate, removeComment);
router.patch('/comment/:commentId/marker', authenticate, updateMarkerStatus);

// Activities
router.get('/activities', authenticate, listActivities);
router.get('/user/:userId/activities', authenticate, listUserActivities);

export default router;
