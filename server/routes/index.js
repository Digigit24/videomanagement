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
  downloadVideosZip,
  removeVideo,
  getProcessingStatus,
  permanentDeleteVideo,
  reprocessVideo,
} from "../controllers/video.js";
import {
  listFolders,
  createNewFolder,
  updateFolderName,
  removeFolder,
  downloadFolder,
  downloadBulk,
  downloadBulkFolders,
  getFolderFileIds,
  createFolderShareToken,
  getSharedFolder,
} from "../controllers/folder.js";
import {
  getUserPermissions,
  getMyPermissions,
  updateUserPermissions,
  listAllPermissions,
  getRoleDefaults,
} from "../controllers/permissions.js";
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
import {
  listActivities,
  listUserActivities,
  listEntityActivities,
} from "../controllers/activity.js";
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
  getPresignedUploadUrl,
  confirmUpload,
} from "../controllers/presignedUpload.js";
import { getWorkspaceAnalytics } from "../services/workspaceStats.js";
import {
  authenticate,
  authenticateStream,
  optionalAuthenticate,
  validateBucket,
  requireWorkspaceMember,
  requireFolderAccess,
  refreshUserRole,
} from "../middleware/auth.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

// Rate limiter for login: max 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth
router.post("/login", loginLimiter, login);
router.post("/register", optionalAuthenticate, register);

// Users
router.get("/users", authenticate, getUsers);
router.get("/user/me", authenticate, getCurrentUser);
router.get("/user/:id", authenticate, getUser);
router.delete("/user/:id", authenticate, refreshUserRole, deleteUser);
router.post("/user/avatar", authenticate, uploadAvatar);
router.patch("/user/:id/role", authenticate, refreshUserRole, changeUserRole);
router.patch("/user/:id/org-member", authenticate, refreshUserRole, toggleOrgMember);
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
router.get("/workspace/:id/members", authenticate, requireWorkspaceMember, getMembers);
router.post("/workspace/:id/members", authenticate, requireWorkspaceMember, addMember);
router.delete("/workspace/:id/members/:userId", authenticate, requireWorkspaceMember, removeMember);

// Invitations
router.post("/invitations", authenticate, createInvite);
router.get("/invite/:code", getInviteInfo);
router.post("/invite/:code/accept", acceptInvite);
router.get(
  "/workspace/:workspaceId/invitations",
  authenticate,
  requireWorkspaceMember,
  listInvitations,
);
router.delete("/invitation/:id", authenticate, revokeInvitation);

// Workspace analytics
router.get("/workspace/:bucket/analytics", authenticate, async (req, res) => {
  try {
    const analytics = await getWorkspaceAnalytics(req.params.bucket);
    res.json({ analytics });
  } catch (error) {
    console.error("Failed to get workspace analytics:", error);
    res.status(500).json({ error: "Failed to get analytics" });
  }
});

// Workspace
router.post("/workspace/:id/delete", authenticate, refreshUserRole, removeWorkspace);

// Videos - poll endpoint (lightweight check for changes)
router.get("/videos/poll", authenticate, validateBucket, async (req, res) => {
  try {
    const { getVideosPollHash } = await import("../services/video.js");
    const hash = await getVideosPollHash(req.bucket);
    res.json(hash);
  } catch (error) {
    res.status(500).json({ error: "Failed to poll videos" });
  }
});

// Videos
router.get("/videos", authenticate, validateBucket, listVideos);
router.get("/video/:id", authenticate, validateBucket, getVideo);
router.patch("/video/:id/status", authenticate, updateStatus);
router.post("/upload", authenticate, validateBucket, uploadVideo);
router.post("/upload/presign", authenticate, validateBucket, getPresignedUploadUrl);
router.post("/upload/confirm", authenticate, validateBucket, confirmUpload);
router.get("/stream/:id", authenticateStream, validateBucket, streamVideo);

// Photo streaming endpoint - serves original image file
router.get("/photo/:id", authenticateStream, async (req, res) => {
  const { id } = req.params;
  try {
    const pool = (await import("../db/index.js")).getPool();
    const result = await pool.query(
      "SELECT object_key, bucket, filename, media_type FROM videos WHERE id = $1",
      [id],
    );
    if (!result.rows[0] || result.rows[0].media_type !== "photo") {
      return res.status(404).json({ error: "Photo not found" });
    }
    const { getObjectStream, resolveBucket: resolve } =
      await import("../services/storage.js");
    const { bucket } = resolve(result.rows[0].bucket);
    const objectKey = result.rows[0].object_key;
    const stream = await getObjectStream(bucket, objectKey);

    const ext =
      result.rows[0].filename.split(".").pop()?.toLowerCase() || "jpg";
    const contentTypes = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      bmp: "image/bmp",
      tiff: "image/tiff",
      svg: "image/svg+xml",
    };
    res.setHeader("Content-Type", contentTypes[ext] || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    stream.pipe(res);
  } catch (error) {
    res.status(404).json({ error: "Photo not found" });
  }
});

router.delete("/video/:id", authenticate, refreshUserRole, validateBucket, removeVideo);

// Video processing status (queue position, progress, step)
router.get("/video/:id/processing", authenticate, getProcessingStatus);

// Re-trigger HLS processing for a video whose original file exists in S3
router.post("/video/:id/reprocess", authenticate, validateBucket, reprocessVideo);

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

// Zip download multiple videos
router.post(
  "/videos/download-zip",
  authenticate,
  validateBucket,
  downloadVideosZip,
);

// Deleted videos (backup)
router.get("/deleted-videos", authenticate, validateBucket, listDeletedVideos);
router.post("/deleted-video/:id/restore", authenticate, restoreVideo);
router.delete(
  "/deleted-video/:id/permanent",
  authenticate,
  refreshUserRole,
  permanentDeleteVideo,
);

// Folders
router.get("/workspace/:workspaceId/folders", authenticate, requireWorkspaceMember, listFolders);
router.post("/workspace/:workspaceId/folders", authenticate, requireWorkspaceMember, createNewFolder);
router.patch("/folder/:id", authenticate, requireFolderAccess, updateFolderName);
router.delete("/folder/:id", authenticate, requireFolderAccess, removeFolder);

// Folder & bulk download (zip)
router.get("/folder/:folderId/download", authenticateStream, requireFolderAccess, downloadFolder);
router.post("/download/bulk", authenticate, downloadBulk);
router.post("/download/bulk-folders", authenticate, downloadBulkFolders);
router.post("/download/folder-files", authenticate, getFolderFileIds);

// Folder sharing
router.post("/folder/:folderId/share-token", authenticate, requireFolderAccess, createFolderShareToken);
router.get("/public/folder/:token", getSharedFolder);

// Per-workspace permissions
router.get(
  "/workspace/:workspaceId/permissions",
  authenticate,
  requireWorkspaceMember,
  listAllPermissions,
);
router.get(
  "/workspace/:workspaceId/permissions/me",
  authenticate,
  requireWorkspaceMember,
  getMyPermissions,
);
router.get(
  "/workspace/:workspaceId/permissions/:userId",
  authenticate,
  requireWorkspaceMember,
  getUserPermissions,
);
router.put(
  "/workspace/:workspaceId/permissions/:userId",
  authenticate,
  refreshUserRole,
  requireWorkspaceMember,
  updateUserPermissions,
);
router.get("/role-defaults/:role", authenticate, getRoleDefaults);

// HLS streaming (master playlist, variant playlists, segments)
router.get("/hls/:id/*", authenticateStream, validateBucket, streamHLS);

// Attachment streaming
router.get(
  "/stream-attachment/:bucket/*",
  authenticateStream,
  async (req, res) => {
    const { bucket } = req.params;
    const objectKey = req.params[0];
    const { getObjectStream, resolveBucket, MAIN_BUCKET } =
      await import("../services/storage.js");

    try {
      const { bucket: physicalBucket, prefix } = resolveBucket(bucket);
      const finalKey = prefix ? `${prefix}${objectKey}` : objectKey;

      // We use MAIN_BUCKET (or physicalBucket) here because we've already manually applied the prefix
      // and we want to bypass getObjectStream's internal prefix logic for this specific relative key case
      const stream = await getObjectStream(physicalBucket, finalKey);
      stream.pipe(res);
    } catch (error) {
      res.status(404).json({ error: "Attachment not found" });
    }
  },
);

// Video thumbnail / Photo display
router.get("/video/:id/thumbnail", authenticateStream, async (req, res) => {
  try {
    const pool = (await import("../db/index.js")).getPool();
    const result = await pool.query(
      "SELECT thumbnail_key, bucket, media_type, filename FROM videos WHERE id = $1",
      [req.params.id],
    );
    if (!result.rows[0]?.thumbnail_key) {
      return res.status(404).json({ error: "Thumbnail not available" });
    }
    const { getObjectStream, resolveBucket: resolve } =
      await import("../services/storage.js");
    const { bucket } = resolve(result.rows[0].bucket);
    const stream = await getObjectStream(bucket, result.rows[0].thumbnail_key);

    // Detect content type based on file extension for photos
    const isPhoto = result.rows[0].media_type === "photo";
    if (isPhoto) {
      const ext = (result.rows[0].filename || result.rows[0].thumbnail_key)
        .split(".")
        .pop()
        ?.toLowerCase();
      const contentTypes = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        bmp: "image/bmp",
        tiff: "image/tiff",
        svg: "image/svg+xml",
      };
      res.setHeader("Content-Type", contentTypes[ext] || "image/jpeg");
    } else {
      res.setHeader("Content-Type", "image/jpeg");
    }
    res.setHeader("Cache-Control", "public, max-age=86400");
    stream.pipe(res);
  } catch (error) {
    res.status(404).json({ error: "Thumbnail not found" });
  }
});

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
router.post("/workspace/:workspaceId/messages", authenticate, requireWorkspaceMember, sendMessage);
router.get("/workspace/:workspaceId/messages", authenticate, requireWorkspaceMember, getMessages);
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

// Share token validation middleware for public endpoints
// Supports both video share tokens and folder share tokens
async function validateShareAccess(req, res, next) {
  const token = req.query.token || req.headers["x-share-token"];
  const videoId = req.params.videoId || req.params.id;

  if (!token) {
    return res.status(403).json({
      error:
        "Share token is required. This video can only be accessed via a valid share link.",
    });
  }

  try {
    // First try video share token
    const { getShareToken } = await import("../services/videoReview.js");
    const shareData = await getShareToken(token);

    if (shareData && shareData.video_id === videoId) {
      req.shareToken = shareData;
      return next();
    }

    // Then try folder share token — check if video belongs to the shared folder
    const pool = (await import("../db/index.js")).getPool();
    const folderTokenResult = await pool.query(
      `SELECT fst.*, f.name as folder_name
       FROM folder_share_tokens fst
       JOIN folders f ON fst.folder_id = f.id
       WHERE fst.token = $1 AND fst.active = true`,
      [token],
    );

    if (folderTokenResult.rows[0]) {
      const folderShare = folderTokenResult.rows[0];
      // Verify the video belongs to this folder
      const videoCheck = await pool.query(
        `SELECT id, bucket, filename, hls_ready, hls_path, size, status
         FROM videos WHERE id = $1 AND folder_id = $2 AND is_active_version = TRUE`,
        [videoId, folderShare.folder_id],
      );

      if (videoCheck.rows[0]) {
        req.shareToken = {
          ...folderShare,
          video_id: videoId,
          bucket: videoCheck.rows[0].bucket,
          filename: videoCheck.rows[0].filename,
          hls_ready: videoCheck.rows[0].hls_ready,
          hls_path: videoCheck.rows[0].hls_path,
          size: videoCheck.rows[0].size,
          status: videoCheck.rows[0].status,
        };
        return next();
      }
    }

    return res.status(403).json({ error: "Invalid or expired share link" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to validate share access" });
  }
}

// Public thumbnail for shared videos (requires valid share token)
router.get("/public/video/:videoId/thumbnail", validateShareAccess, async (req, res) => {
  try {
    const pool = (await import("../db/index.js")).getPool();
    const result = await pool.query(
      "SELECT thumbnail_key, bucket, media_type, filename FROM videos WHERE id = $1",
      [req.params.videoId],
    );
    if (!result.rows[0]?.thumbnail_key) {
      return res.status(404).json({ error: "Thumbnail not available" });
    }
    const { getObjectStream, resolveBucket: resolve } =
      await import("../services/storage.js");
    const { bucket } = resolve(result.rows[0].bucket);
    const stream = await getObjectStream(bucket, result.rows[0].thumbnail_key);

    const isPhoto = result.rows[0].media_type === "photo";
    if (isPhoto) {
      const ext = (result.rows[0].filename || result.rows[0].thumbnail_key)
        .split(".")
        .pop()
        ?.toLowerCase();
      const contentTypes = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        gif: "image/gif", webp: "image/webp",
      };
      res.setHeader("Content-Type", contentTypes[ext] || "image/jpeg");
    } else {
      res.setHeader("Content-Type", "image/jpeg");
    }
    res.setHeader("Cache-Control", "public, max-age=86400");
    stream.pipe(res);
  } catch (error) {
    res.status(404).json({ error: "Thumbnail not found" });
  }
});

// Public Video & Review endpoints (requires valid share token)
router.get("/public/video/:videoId", validateShareAccess, getPublicVideoInfo);
router.get("/public/video/:videoId/reviews", validateShareAccess, listReviews);
router.post("/public/video/:videoId/reviews", validateShareAccess, addReview);

// Public HLS streaming for shared videos (requires share token)
router.get("/public/hls/:id/*", validateShareAccess, async (req, res) => {
  const { id } = req.params;
  const hlsPath = req.params[0];
  const { getObjectStream } = await import("../services/storage.js");
  const { getVideoPublicInfo } = await import("../services/videoReview.js");

  try {
    const video = await getVideoPublicInfo(id);
    if (!video || !video.hls_ready || !video.hls_path) {
      return res.status(404).json({ error: "HLS not available" });
    }

    // Derive the HLS directory from the DB's hls_path (includes workspace prefix)
    const hlsDir = video.hls_path.replace(/\/master\.m3u8$/, "");
    const objectKey = `${hlsDir}/${hlsPath}`;

    let stream;
    try {
      stream = await getObjectStream(video.bucket, objectKey);
    } catch (s3Error) {
      console.error(
        `[Public HLS] S3 fetch failed: bucket=${video.bucket}, key=${objectKey}, error=${s3Error.message}`,
      );
      return res.status(404).json({ error: "HLS file not found in storage" });
    }

    if (hlsPath.endsWith(".m3u8")) {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");

      // Rewrite relative URIs to include share token so sub-requests authenticate
      const shareToken = req.query.token || req.headers["x-share-token"];

      // Read playlist with timeout/abort guards (matches authenticated streamHLS)
      let playlist;
      try {
        playlist = await new Promise((resolve, reject) => {
          const chunks = [];
          let settled = false;
          const settle = (fn, val) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            req.removeListener("close", onAbort);
            try { stream.destroy?.(); } catch {}
            fn(val);
          };
          const timer = setTimeout(
            () => settle(reject, new Error("S3 read timeout after 15s")),
            15000,
          );
          const onAbort = () => settle(reject, new Error("Client aborted"));
          req.on("close", onAbort);
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("error", (err) => settle(reject, err));
          stream.on("end", () =>
            settle(resolve, Buffer.concat(chunks).toString("utf8")),
          );
        });
      } catch (readErr) {
        console.error(`[Public HLS] Failed to read m3u8: ${readErr.message}`);
        if (!res.headersSent) {
          return res.status(502).json({ error: "Failed to read playlist" });
        }
        return res.end();
      }

      if (!playlist) {
        if (!res.headersSent) {
          return res.status(502).json({ error: "Empty playlist" });
        }
        return res.end();
      }

      if (shareToken) {
        playlist = playlist
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) return line;
            if (/^https?:\/\//i.test(trimmed)) return line;
            const sep = trimmed.includes("?") ? "&" : "?";
            return `${trimmed}${sep}token=${encodeURIComponent(shareToken)}`;
          })
          .join("\n");
      }
      return res.send(playlist);
    } else {
      if (hlsPath.endsWith(".ts")) {
        res.setHeader("Content-Type", "video/mp2t");
      }
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
      const onAbort = () => { try { stream.destroy?.(); } catch {} };
      req.on("close", onAbort);
      stream.on("error", (err) => {
        console.error(`[Public HLS] Stream error: ${err.message}`);
        if (!res.headersSent) res.status(500).json({ error: "Stream failed" });
        else res.end();
      });
      stream.pipe(res);
    }
  } catch (error) {
    console.error(`[Public HLS] Error: ${error.message}`);
    res.status(404).json({ error: "Stream not found" });
  }
});

// Public direct video stream for shared videos (requires share token)
// Since originals are not stored in S3, this endpoint redirects to HLS.
router.get("/public/stream/:id", validateShareAccess, async (req, res) => {
  const { id } = req.params;
  const { getVideoPublicInfo } = await import("../services/videoReview.js");
  const { getVideoStream, resolveBucket: resolve } =
    await import("../services/storage.js");
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

    // If HLS is ready, we can use it as primary, but usually /stream refers to the original
    // For this app, let's allow streaming the original if it exists, otherwise HLS playlist
    const useHLS = videoRow.rows[0].hls_ready && videoRow.rows[0].hls_path;
    const objectKey = useHLS
      ? videoRow.rows[0].hls_path
      : videoRow.rows[0].object_key;

    if (!objectKey) {
      return res.status(404).json({ error: "Video content not found" });
    }

    // getVideoStream resolves the bucket internally, pass the workspace bucket
    const stream = await getVideoStream(video.bucket, objectKey, range);

    if (useHLS) {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "public, max-age=3600");
    } else {
      res.setHeader("Accept-Ranges", "bytes");
      if (stream.headers) {
        if (stream.headers["content-type"])
          res.setHeader("Content-Type", stream.headers["content-type"]);
        if (stream.headers["content-length"])
          res.setHeader("Content-Length", stream.headers["content-length"]);
        if (stream.headers["content-range"])
          res.setHeader("Content-Range", stream.headers["content-range"]);
      }
      if (!res.getHeader("Content-Length") && videoRow.rows[0].size) {
        res.setHeader("Content-Length", videoRow.rows[0].size);
      }
      if (!res.getHeader("Content-Type")) {
        res.setHeader("Content-Type", "video/mp4");
      }
    }

    if (stream.statusCode) {
      res.writeHead(stream.statusCode, res.getHeaders());
      stream.body.pipe(res);
    } else {
      stream.pipe(res);
    }
  } catch (error) {
    res.status(500).json({ error: "Stream failed" });
  }
});

// Share token management (authenticated)
router.post("/video/:videoId/share-token", authenticate, generateShareToken);
router.get("/share/:token", validateShareToken);

// Video reviews (authenticated access for internal users)
router.get("/video/:videoId/reviews", authenticate, listReviews);

// Activities
router.get("/activities", authenticate, listActivities);
router.get("/user/:userId/activities", authenticate, listUserActivities);
router.get(
  "/activities/:entityType/:entityId",
  authenticate,
  listEntityActivities,
);

import recycleBinRouter from "./recycleBin.js";
router.use("/admin/recycle-bin", recycleBinRouter);

export default router;
