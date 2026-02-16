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

  if (!bucket) {
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
      req.bucket = bucket;
      return next();
    }
  } catch (error) {
    console.error("Error validating bucket:", error);
  }

  return res.status(400).json({ error: "Invalid bucket" });
}
