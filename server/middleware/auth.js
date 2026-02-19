import jwt from "jsonwebtoken";
import { getPool } from "../db/index.js";

export function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.substring(7);
    console.log(
      `[Auth Middleware] JWT_SECRET exists: ${!!process.env.JWT_SECRET}, Length: ${process.env.JWT_SECRET?.length}`,
    );
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

export async function validateBucket(req, res, next) {
  const bucket = req.query.bucket || req.body.bucket;
  console.log(
    `[Bucket Validation] Request URL: ${req.url}, Method: ${req.method}`,
  );
  console.log(`[Bucket Validation] Checking bucket: "${bucket}"`);

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
          return next();
        }
      } catch (e) {
        console.warn(
          `[Bucket Validation] Failed to resolve bucket from video ID: ${e.message}`,
        );
      }
    }
    console.warn(`[Bucket Validation] No bucket provided for ${req.url}`);
    return res.status(400).json({ error: "Bucket parameter required" });
  }

  // Check env buckets first
  const envBuckets = process.env.ZATA_BUCKETS
    ? process.env.ZATA_BUCKETS.split(",").map((b) => b.trim())
    : [];

  if (envBuckets.includes(bucket)) {
    req.bucket = bucket;
    return next();
  }

  // Also check workspace buckets (auto-created from client names)
  try {
    const result = await getPool().query(
      "SELECT bucket FROM workspaces WHERE bucket = $1",
      [bucket],
    );

    if (result.rows.length > 0) {
      console.log(
        `[Bucket Validation] Bucket "${bucket}" found in workspaces table.`,
      );
      req.bucket = bucket;
      return next();
    }
  } catch (error) {
    console.error(
      `[Bucket Validation] DB Error for bucket "${bucket}":`,
      error,
    );
  }

  console.warn(`[Bucket Validation] FAILED for bucket: "${bucket}"`);
  return res.status(400).json({ error: "Invalid bucket" });
}
