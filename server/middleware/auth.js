import jwt from "jsonwebtoken";
import { getPool } from "../db/index.js";

export function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (error) {
    console.error("[Auth] Authentication failed:", error.message);
    if (!process.env.JWT_SECRET) {
      console.error("[Auth] FATAL: JWT_SECRET is not set in environment!");
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function optionalAuthenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    }
  } catch (error) {
    // Token invalid or missing - continue without auth
    req.user = null;
  }
  next();
}

export function authenticateStream(req, res, next) {
  try {
    // For streaming, accept token from query param (since video players can't send headers)
    const token = req.query.token || req.headers.authorization?.substring(7);

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Middleware that refreshes the user's role from the database.
 * Use on sensitive operations (delete, role changes, permission updates)
 * to prevent stale JWT roles from granting elevated access.
 */
export async function refreshUserRole(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const result = await getPool().query(
      "SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL",
      [req.user.id],
    );

    if (!result.rows[0]) {
      return res.status(401).json({ error: "User account not found or deactivated" });
    }

    // Override the JWT role with the current DB role
    req.user.role = result.rows[0].role;
    next();
  } catch (error) {
    console.error("[Auth] Failed to refresh user role:", error.message);
    return res.status(500).json({ error: "Failed to verify user permissions" });
  }
}

/**
 * Check if the authenticated user is a member of the workspace (by bucket name).
 * Admins bypass this check.
 */
async function verifyWorkspaceMembership(req, bucket) {
  if (!req.user) return false;
  if (req.user.role === "admin") return true;

  try {
    const result = await getPool().query(
      `SELECT 1 FROM workspace_members wm
       JOIN workspaces w ON wm.workspace_id = w.id
       WHERE w.bucket = $1 AND wm.user_id = $2
       LIMIT 1`,
      [bucket, req.user.id],
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error("[Auth] Workspace membership check failed:", error.message);
    return false;
  }
}

export async function validateBucket(req, res, next) {
  const bucket = req.query.bucket || req.body.bucket;

  if (!bucket) {
    // If bucket is missing but we have a video ID in params, try to resolve it from the video
    if (req.params.id || req.params.videoId) {
      try {
        const { getBucketByVideoId } = await import("../services/video.js");
        const resolved = await getBucketByVideoId(
          req.params.id || req.params.videoId,
        );
        if (resolved) {
          req.bucket = resolved;
          // Verify membership for the resolved bucket
          if (!(await verifyWorkspaceMembership(req, resolved))) {
            return res.status(403).json({ error: "You are not a member of this workspace" });
          }
          return next();
        }
      } catch (e) {
        console.warn(
          `[Bucket Validation] Failed to resolve bucket from video ID: ${e.message}`,
        );
      }
    }
    return res.status(400).json({ error: "Bucket parameter required" });
  }

  // Check env buckets first
  const envBuckets = process.env.ZATA_BUCKETS
    ? process.env.ZATA_BUCKETS.split(",").map((b) => b.trim())
    : [];

  if (envBuckets.includes(bucket)) {
    req.bucket = bucket;
    // Verify membership even for env buckets
    if (!(await verifyWorkspaceMembership(req, bucket))) {
      return res.status(403).json({ error: "You are not a member of this workspace" });
    }
    return next();
  }

  // Also check workspace buckets (auto-created from client names)
  try {
    const result = await getPool().query(
      "SELECT bucket FROM workspaces WHERE bucket = $1",
      [bucket],
    );

    if (result.rows.length > 0) {
      req.bucket = bucket;
      // Verify membership for workspace buckets
      if (!(await verifyWorkspaceMembership(req, bucket))) {
        return res.status(403).json({ error: "You are not a member of this workspace" });
      }
      return next();
    }
  } catch (error) {
    console.error(
      `[Bucket Validation] DB Error for bucket "${bucket}":`,
      error,
    );
  }

  return res.status(400).json({ error: "Invalid bucket" });
}

/**
 * Middleware to verify user is a member of the workspace that owns a folder.
 * Resolves workspace from :folderId or :id param via the folders table.
 * Admins bypass this check.
 */
export async function requireFolderAccess(req, res, next) {
  const folderId = req.params.folderId || req.params.id;
  if (!folderId) {
    return res.status(400).json({ error: "Folder ID required" });
  }

  if (req.user.role === "admin") {
    return next();
  }

  try {
    const result = await getPool().query(
      `SELECT wm.user_id FROM folders f
       JOIN workspace_members wm ON wm.workspace_id = f.workspace_id
       WHERE f.id = $1 AND wm.user_id = $2
       LIMIT 1`,
      [folderId, req.user.id],
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ error: "You are not a member of this workspace" });
    }
    next();
  } catch (error) {
    console.error("[Auth] Folder access check failed:", error.message);
    return res.status(500).json({ error: "Failed to verify folder access" });
  }
}

/**
 * Middleware to verify user is a member of a workspace identified by :workspaceId param.
 * Admins bypass this check.
 */
export async function requireWorkspaceMember(req, res, next) {
  const workspaceId = req.params.workspaceId || req.params.id;
  if (!workspaceId) {
    return res.status(400).json({ error: "Workspace ID required" });
  }

  if (req.user.role === "admin") {
    return next();
  }

  try {
    const result = await getPool().query(
      "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 LIMIT 1",
      [workspaceId, req.user.id],
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ error: "You are not a member of this workspace" });
    }
    next();
  } catch (error) {
    console.error("[Auth] Workspace member check failed:", error.message);
    return res.status(500).json({ error: "Failed to verify workspace access" });
  }
}
