import {
  createFolder,
  getFolders,
  getFolderById,
  updateFolder,
  deleteFolder,
} from "../services/folder.js";
import { getWorkspaceById } from "../services/workspace.js";
import { checkPermission } from "../services/permissions.js";
import { apiError } from "../utils/logger.js";
import archiver from "archiver";
import { getPool } from "../db/index.js";
import { getObjectStream } from "../services/storage.js";
import crypto from "crypto";

export async function listFolders(req, res) {
  try {
    const { workspaceId } = req.params;
    const folders = await getFolders(workspaceId);
    res.json({ folders });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to list folders" });
  }
}

export async function createNewFolder(req, res) {
  try {
    const { workspaceId } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Folder name is required" });
    }

    // Check permission
    const canCreate = await checkPermission(workspaceId, req.user.id, "can_create_folder");
    if (!canCreate) {
      return res.status(403).json({ error: "You do not have permission to create folders in this workspace" });
    }

    const folder = await createFolder(workspaceId, name, req.user.id);
    res.status(201).json({ folder });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to create folder" });
  }
}

export async function updateFolderName(req, res) {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Folder name is required" });
    }

    const folder = await getFolderById(id);
    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    const updated = await updateFolder(id, name);
    res.json({ folder: updated });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update folder" });
  }
}

export async function removeFolder(req, res) {
  try {
    const { id } = req.params;

    const folder = await getFolderById(id);
    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    // Check permission
    const canDelete = await checkPermission(folder.workspace_id, req.user.id, "can_delete_folder");
    if (!canDelete) {
      return res.status(403).json({ error: "You do not have permission to delete folders" });
    }

    await deleteFolder(id);
    res.json({ message: "Folder deleted" });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to delete folder" });
  }
}

// Helper: deduplicate filenames inside a zip
function deduplicateFilename(name, usedNames) {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  const ext = name.includes(".") ? "." + name.split(".").pop() : "";
  const base = ext ? name.slice(0, -ext.length) : name;
  let counter = 1;
  let candidate;
  do {
    candidate = `${base}_${counter}${ext}`;
    counter++;
  } while (usedNames.has(candidate));
  usedNames.add(candidate);
  return candidate;
}

// Helper: pipe a single file from S3 into an archiver zip
// Note: getObjectStream already calls resolveBucket internally, so pass the workspace bucket directly
async function appendFileToArchive(archive, bucketName, objectKey, filename) {
  const stream = await getObjectStream(bucketName, objectKey);
  archive.append(stream, { name: filename });
}

// Download an entire folder as a zip
export async function downloadFolder(req, res) {
  try {
    const { folderId } = req.params;
    const pool = getPool();

    // Get folder info
    const folderResult = await pool.query(
      `SELECT f.*, w.bucket as workspace_bucket FROM folders f JOIN workspaces w ON f.workspace_id = w.id WHERE f.id = $1`,
      [folderId],
    );
    const folder = folderResult.rows[0];
    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    // Get all active files in this folder
    const videosResult = await pool.query(
      `SELECT id, filename, object_key, bucket, media_type, size FROM videos WHERE folder_id = $1 AND is_active_version = TRUE ORDER BY created_at`,
      [folderId],
    );
    const files = videosResult.rows;

    if (files.length === 0) {
      return res.status(400).json({ error: "Folder is empty — nothing to download" });
    }

    const safeFolderName = folder.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFolderName}.zip"`);

    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.on("error", (err) => {
      console.error("[FolderDownload] Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create zip" });
      }
    });
    archive.pipe(res);

    const usedNames = new Set();
    for (const file of files) {
      const fname = deduplicateFilename(file.filename, usedNames);
      try {
        await appendFileToArchive(archive, file.bucket, file.object_key, fname);
      } catch (err) {
        console.warn(`[FolderDownload] Skipping file ${file.id} (${file.filename}): ${err.message}`);
      }
    }

    await archive.finalize();
  } catch (error) {
    apiError(req, error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to download folder" });
    }
  }
}

// Download selected files as a zip (POST with { videoIds: [...] })
export async function downloadBulk(req, res) {
  try {
    const { videoIds } = req.body;

    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ error: "No files selected" });
    }

    if (videoIds.length > 500) {
      return res.status(400).json({ error: "Too many files selected (max 500)" });
    }

    const pool = getPool();
    const placeholders = videoIds.map((_, i) => `$${i + 1}`).join(",");
    const result = await pool.query(
      `SELECT id, filename, object_key, bucket, media_type, size FROM videos WHERE id IN (${placeholders}) AND is_active_version = TRUE ORDER BY created_at`,
      videoIds,
    );
    const files = result.rows;

    if (files.length === 0) {
      return res.status(400).json({ error: "No valid files found" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="selected-files.zip"`);

    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.on("error", (err) => {
      console.error("[BulkDownload] Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create zip" });
      }
    });
    archive.pipe(res);

    const usedNames = new Set();
    for (const file of files) {
      const fname = deduplicateFilename(file.filename, usedNames);
      try {
        await appendFileToArchive(archive, file.bucket, file.object_key, fname);
      } catch (err) {
        console.warn(`[BulkDownload] Skipping file ${file.id} (${file.filename}): ${err.message}`);
      }
    }

    await archive.finalize();
  } catch (error) {
    apiError(req, error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to download files" });
    }
  }
}

// Download multiple folders as a single zip (POST with { folderIds: [...] })
export async function downloadBulkFolders(req, res) {
  try {
    const { folderIds } = req.body;

    if (!folderIds || !Array.isArray(folderIds) || folderIds.length === 0) {
      return res.status(400).json({ error: "No folders selected" });
    }

    const pool = getPool();

    // Get folder info
    const folderPlaceholders = folderIds.map((_, i) => `$${i + 1}`).join(",");
    const foldersResult = await pool.query(
      `SELECT f.id, f.name FROM folders f WHERE f.id IN (${folderPlaceholders})`,
      folderIds,
    );
    const folderMap = new Map(foldersResult.rows.map(f => [f.id, f.name]));

    if (folderMap.size === 0) {
      return res.status(400).json({ error: "No valid folders found" });
    }

    // Get all files across these folders
    const filesResult = await pool.query(
      `SELECT id, filename, object_key, bucket, media_type, folder_id FROM videos WHERE folder_id IN (${folderPlaceholders}) AND is_active_version = TRUE ORDER BY folder_id, created_at`,
      folderIds,
    );
    const files = filesResult.rows;

    if (files.length === 0) {
      return res.status(400).json({ error: "Selected folders are empty — nothing to download" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="folders.zip"`);

    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.on("error", (err) => {
      console.error("[BulkFolderDownload] Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create zip" });
      }
    });
    archive.pipe(res);

    // Track used names per folder subdirectory
    const folderUsedNames = new Map();
    for (const file of files) {
      const folderName = (folderMap.get(file.folder_id) || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_");
      if (!folderUsedNames.has(folderName)) {
        folderUsedNames.set(folderName, new Set());
      }
      const usedNames = folderUsedNames.get(folderName);
      const fname = deduplicateFilename(file.filename, usedNames);
      try {
        const stream = await getObjectStream(file.bucket, file.object_key);
        archive.append(stream, { name: `${folderName}/${fname}` });
      } catch (err) {
        console.warn(`[BulkFolderDownload] Skipping file ${file.id}: ${err.message}`);
      }
    }

    await archive.finalize();
  } catch (error) {
    apiError(req, error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to download folders" });
    }
  }
}

// === Folder Share Tokens ===

export async function createFolderShareToken(req, res) {
  try {
    const { folderId } = req.params;
    const { requireLogin } = req.body;
    const pool = getPool();

    const folder = await getFolderById(folderId);
    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    // Check for existing active token
    const existing = await pool.query(
      `SELECT * FROM folder_share_tokens WHERE folder_id = $1 AND active = true LIMIT 1`,
      [folderId],
    );

    if (existing.rows[0]) {
      // Update require_login if changed
      if (existing.rows[0].require_login !== !!requireLogin) {
        await pool.query(
          `UPDATE folder_share_tokens SET require_login = $1, updated_at = NOW() WHERE id = $2`,
          [!!requireLogin, existing.rows[0].id],
        );
        existing.rows[0].require_login = !!requireLogin;
      }
      return res.json({ token: existing.rows[0].token, folderId, requireLogin: existing.rows[0].require_login });
    }

    const token = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `INSERT INTO folder_share_tokens (folder_id, token, created_by, require_login) VALUES ($1, $2, $3, $4)`,
      [folderId, token, req.user.id, !!requireLogin],
    );

    res.json({ token, folderId, requireLogin: !!requireLogin });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to create share token" });
  }
}

// Public: get folder info + videos via share token
export async function getSharedFolder(req, res) {
  try {
    const { token } = req.params;
    const pool = getPool();

    const tokenResult = await pool.query(
      `SELECT fst.*, f.name as folder_name, f.workspace_id
       FROM folder_share_tokens fst
       JOIN folders f ON fst.folder_id = f.id
       WHERE fst.token = $1 AND fst.active = true`,
      [token],
    );

    if (!tokenResult.rows[0]) {
      return res.status(404).json({ error: "Invalid or expired share link" });
    }

    const shareData = tokenResult.rows[0];

    // Get videos in the folder
    const videosResult = await pool.query(
      `SELECT id, filename, media_type, size, status, hls_ready, created_at, thumbnail_key
       FROM videos WHERE folder_id = $1 AND is_active_version = TRUE ORDER BY created_at DESC`,
      [shareData.folder_id],
    );

    res.json({
      folder: {
        id: shareData.folder_id,
        name: shareData.folder_name,
      },
      videos: videosResult.rows,
      requireLogin: shareData.require_login,
    });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to load shared folder" });
  }
}

// Get all video IDs in given folders (for "download original" of folders)
export async function getFolderFileIds(req, res) {
  try {
    const { folderIds } = req.body;

    if (!folderIds || !Array.isArray(folderIds) || folderIds.length === 0) {
      return res.status(400).json({ error: "No folders selected" });
    }

    const pool = getPool();
    const placeholders = folderIds.map((_, i) => `$${i + 1}`).join(",");
    const result = await pool.query(
      `SELECT id, bucket FROM videos WHERE folder_id IN (${placeholders}) AND is_active_version = TRUE ORDER BY created_at`,
      folderIds,
    );

    res.json({ files: result.rows });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get folder files" });
  }
}
