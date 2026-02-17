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
  sendMessage,
  getMessages,
  removeMessage,
} from "../controllers/chatMessage.js";
import {
  generateShareToken,
  validateShareToken,
  getPublicVideoInfo,
  addReview,
  listReviews,
} from "../controllers/videoReview.js";
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

// Logo streaming (client images on workspace cards)
router.get("/logo/:bucket/*", async (req, res) => {
  const { bucket } = req.params;
  const filename = req.params[0];
  const { getObjectStream, MAIN_BUCKET } =
    await import("../services/storage.js");

  try {
    const objectKey = `logos/${bucket}/${filename}`;
    const stream = await getObjectStream(MAIN_BUCKET || bucket, objectKey);

    // Set content type based on file extension
    const ext = filename.toLowerCase().split(".").pop();
    const contentTypes = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
    };
    if (contentTypes[ext]) {
      res.setHeader("Content-Type", contentTypes[ext]);
    }
    res.setHeader("Cache-Control", "public, max-age=86400");

    stream.pipe(res);
  } catch (error) {
    res.status(404).json({ error: "Logo not found" });
  }
});

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

// Workspace Chat Messages
router.post("/workspace/:workspaceId/messages", authenticate, sendMessage);
router.get("/workspace/:workspaceId/messages", authenticate, getMessages);
router.delete("/chat-message/:messageId", authenticate, removeMessage);

// Chat attachment streaming
router.get(
  "/stream-chat-attachment/*",
  authenticateStream,
  async (req, res) => {
    const objectKey = req.params[0];
    const { getObjectStream } = await import("../services/storage.js");
    const { MAIN_BUCKET } = await import("../services/storage.js");

    try {
      const stream = await getObjectStream(MAIN_BUCKET, objectKey);

      // Set content type based on file extension
      const ext = objectKey.toLowerCase().split(".").pop();
      const contentTypes = {
        // Images
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        bmp: "image/bmp",
        ico: "image/x-icon",
        tiff: "image/tiff",
        tif: "image/tiff",
        // Videos
        mp4: "video/mp4",
        mov: "video/quicktime",
        webm: "video/webm",
        avi: "video/x-msvideo",
        mkv: "video/x-matroska",
        flv: "video/x-flv",
        wmv: "video/x-ms-wmv",
        m4v: "video/mp4",
        "3gp": "video/3gpp",
        // Audio
        mp3: "audio/mpeg",
        wav: "audio/wav",
        ogg: "audio/ogg",
        aac: "audio/aac",
        flac: "audio/flac",
        m4a: "audio/mp4",
        // Documents
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ppt: "application/vnd.ms-powerpoint",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        txt: "text/plain",
        csv: "text/csv",
        rtf: "application/rtf",
        // Archives
        zip: "application/zip",
        rar: "application/x-rar-compressed",
        "7z": "application/x-7z-compressed",
        tar: "application/x-tar",
        gz: "application/gzip",
        // Other
        json: "application/json",
        xml: "application/xml",
      };
      if (contentTypes[ext]) {
        res.setHeader("Content-Type", contentTypes[ext]);
      } else {
        res.setHeader("Content-Type", "application/octet-stream");
      }

      // Set download header for non-viewable types
      const inlineTypes = [
        "image/",
        "video/",
        "audio/",
        "text/",
        "application/pdf",
      ];
      const ct = contentTypes[ext] || "";
      if (!inlineTypes.some((t) => ct.startsWith(t))) {
        const filename = objectKey.split("/").pop();
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`,
        );
      }

      stream.pipe(res);
    } catch (error) {
      res.status(404).json({ error: "Attachment not found" });
    }
  },
);

// Public Video & Review endpoints (no auth needed - accessed via share links)
router.get("/public/video/:videoId", getPublicVideoInfo);
router.get("/public/video/:videoId/reviews", listReviews);
router.post("/public/video/:videoId/reviews", addReview);

// Public HLS streaming for shared videos (no auth)
router.get("/public/hls/:id/*", async (req, res) => {
  const { id } = req.params;
  const hlsPath = req.params[0];
  const { getObjectStream, MAIN_BUCKET } = await import(
    "../services/storage.js"
  );
  const { getVideoPublicInfo } = await import("../services/videoReview.js");

  try {
    const video = await getVideoPublicInfo(id);
    if (!video || !video.hls_ready) {
      return res.status(404).json({ error: "HLS not available" });
    }

    const objectKey = `hls/${id}/${hlsPath}`;
    const stream = await getObjectStream(
      MAIN_BUCKET || video.bucket,
      objectKey,
    );

    if (hlsPath.endsWith(".m3u8")) {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    } else if (hlsPath.endsWith(".ts")) {
      res.setHeader("Content-Type", "video/mp2t");
    }
    res.setHeader("Cache-Control", "public, max-age=3600");

    stream.pipe(res);
  } catch (error) {
    res.status(404).json({ error: "Stream not found" });
  }
});

// Public direct video stream for shared videos (no auth)
router.get("/public/stream/:id", async (req, res) => {
  const { id } = req.params;
  const { getVideoPublicInfo } = await import("../services/videoReview.js");
  const { getVideoStream, resolveBucket } = await import(
    "../services/storage.js"
  );
  const pool = (await import("../db/index.js")).getPool();

  try {
    const video = await getVideoPublicInfo(id);
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    const videoRow = await pool.query("SELECT * FROM videos WHERE id = $1", [
      id,
    ]);
    if (!videoRow.rows[0]) {
      return res.status(404).json({ error: "Video not found" });
    }

    const range = req.headers.range;
    const bucket = await resolveBucket(video.bucket);
    const stream = await getVideoStream(
      bucket,
      videoRow.rows[0].object_key,
      range,
    );

    if (stream.statusCode) {
      res.writeHead(stream.statusCode, stream.headers);
      stream.body.pipe(res);
    } else {
      stream.pipe(res);
    }
  } catch (error) {
    res.status(500).json({ error: "Stream failed" });
  }
});

// Share token management (authenticated)
router.post(
  "/video/:videoId/share-token",
  authenticate,
  generateShareToken,
);
router.get("/share/:token", validateShareToken);

// Video reviews (authenticated access for internal users)
router.get("/video/:videoId/reviews", authenticate, listReviews);

// Activities
router.get("/activities", authenticate, listActivities);
router.get("/user/:userId/activities", authenticate, listUserActivities);

import recycleBinRouter from "./recycleBin.js";
router.use("/admin/recycle-bin", recycleBinRouter);

export default router;
