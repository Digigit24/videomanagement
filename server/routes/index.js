import express from "express";
import { login } from "../controllers/auth.js";
import { getBuckets } from "../controllers/bucket.js";
import {
  listVideos,
  getVideo,
  updateStatus,
  streamVideo,
  uploadVideo,
  streamHLS,
  getVersionHistory,
  listDeletedVideos,
  restoreVideo,
  downloadVideo,
  removeVideo,
} from "../controllers/video.js";
import {
  register,
  getUsers,
  getUser,
  getCurrentUser,
  deleteUser,
  uploadAvatar,
  changeUserRole,
  toggleOrgMember,
  getAvatarStream,
} from "../controllers/user.js";
import {
  addComment,
  getComments,
  removeComment,
  updateMarkerStatus,
} from "../controllers/comment.js";
import { listActivities, listUserActivities } from "../controllers/activity.js";
import { recordView, getVideoViewers } from "../services/views.js";
import {
  listWorkspaces,
  createNewWorkspace,
  updateWorkspaceDetails,
  uploadWorkspaceLogo,
  getMembers,
  listOrgMembers,
  addMember,
  removeMember,
  createInvite,
  getInviteInfo,
  acceptInvite,
  listInvitations,
  revokeInvitation,
  removeWorkspace,
} from "../controllers/workspace.js";
import {
  getNotifications,
  getNotificationCount,
  markNotificationSeen,
  markAllNotificationsSeen,
} from "../controllers/notification.js";
import {
  authenticate,
  authenticateStream,
  validateBucket,
} from "../middleware/auth.js";

const router = express.Router();

// Auth
router.post("/login", login);
router.post("/register", register);

// Users
router.get("/users", authenticate, getUsers);
router.get("/user/me", authenticate, getCurrentUser);
router.get("/user/:id", authenticate, getUser);
router.delete("/user/:id", authenticate, deleteUser);
router.post("/user/avatar", authenticate, uploadAvatar);
router.patch("/user/:id/role", authenticate, changeUserRole);
router.patch("/user/:id/org-member", authenticate, toggleOrgMember);
router.get("/avatar/*", getAvatarStream);

// Organization members (for workspace creation member picker)
router.get("/org-members", authenticate, listOrgMembers);

// Notifications
router.get("/notifications", authenticate, getNotifications);
router.get("/notifications/count", authenticate, getNotificationCount);
router.patch("/notification/:id/seen", authenticate, markNotificationSeen);
router.patch("/notifications/seen-all", authenticate, markAllNotificationsSeen);

// Buckets
router.get("/buckets", authenticate, getBuckets);

// Workspaces
router.get("/workspaces", authenticate, listWorkspaces);
router.post("/workspaces", authenticate, createNewWorkspace);
router.patch("/workspace/:id", authenticate, updateWorkspaceDetails);
router.post("/workspace/:id/logo", authenticate, uploadWorkspaceLogo);
router.get("/workspace/:id/members", authenticate, getMembers);
router.post("/workspace/:id/members", authenticate, addMember);
router.delete("/workspace/:id/members/:userId", authenticate, removeMember);

// Invitations
router.post("/invitations", authenticate, createInvite);
router.get("/invite/:code", getInviteInfo);
router.post("/invite/:code/accept", acceptInvite);
router.get(
  "/workspace/:workspaceId/invitations",
  authenticate,
  listInvitations,
);
router.delete("/invitation/:id", authenticate, revokeInvitation);

// Workspace
router.post("/workspace/:id/delete", authenticate, removeWorkspace);

// Videos
router.get("/videos", authenticate, validateBucket, listVideos);
router.get("/video/:id", authenticate, validateBucket, getVideo);
router.patch("/video/:id/status", authenticate, updateStatus);
router.post("/upload", authenticate, validateBucket, uploadVideo);
router.get("/stream/:id", authenticateStream, validateBucket, streamVideo);
router.delete("/video/:id", authenticate, validateBucket, removeVideo);

// Video versioning
router.get(
  "/video/:id/versions",
  authenticate,
  validateBucket,
  getVersionHistory,
);

// Video download (uses authenticateStream since it opens via window.open)
router.get(
  "/video/:id/download",
  authenticateStream,
  validateBucket,
  downloadVideo,
);

// Deleted videos (backup)
router.get("/deleted-videos", authenticate, validateBucket, listDeletedVideos);
router.post("/deleted-video/:id/restore", authenticate, restoreVideo);

// HLS streaming
router.get("/hls/:id/*", authenticateStream, validateBucket, streamHLS);

// Attachment streaming
router.get(
  "/stream-attachment/:bucket/*",
  authenticateStream,
  async (req, res) => {
    const { bucket } = req.params;
    const objectKey = req.params[0];
    const { getObjectStream } = await import("../services/storage.js");

    try {
      const stream = await getObjectStream(bucket, objectKey);
      stream.pipe(res);
    } catch (error) {
      res.status(404).json({ error: "Attachment not found" });
    }
  },
);

// Video views
router.post("/video/:videoId/view", authenticate, async (req, res) => {
  try {
    await recordView(req.params.videoId, req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to record view" });
  }
});

router.get("/video/:videoId/viewers", authenticate, async (req, res) => {
  try {
    const viewers = await getVideoViewers(req.params.videoId);
    res.json({ viewers });
  } catch (error) {
    res.status(500).json({ error: "Failed to get viewers" });
  }
});

// Comments
router.post("/video/:videoId/comments", authenticate, addComment);
router.get("/video/:videoId/comments", authenticate, getComments);
router.delete("/comment/:commentId", authenticate, removeComment);
router.patch("/comment/:commentId/marker", authenticate, updateMarkerStatus);

// Activities
router.get("/activities", authenticate, listActivities);
router.get("/user/:userId/activities", authenticate, listUserActivities);

import recycleBinRouter from "./recycleBin.js";
router.use("/admin/recycle-bin", recycleBinRouter);

export default router;
