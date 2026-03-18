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
import { getObjectStream, getVideoStream, resolveBucket } from "../services/storage.js";

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
async function appendFileToArchive(archive, bucketName, objectKey, filename) {
  const { bucket: physicalBucket } = resolveBucket(bucketName);
  const stream = await getObjectStream(physicalBucket, objectKey);
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
      `SELECT id, filename, object_key, bucket, media_type, size FROM videos WHERE folder_id = $1 AND is_active_version = TRUE AND deleted_at IS NULL ORDER BY created_at`,
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
      `SELECT id, filename, object_key, bucket, media_type, size FROM videos WHERE id IN (${placeholders}) AND is_active_version = TRUE AND deleted_at IS NULL ORDER BY created_at`,
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
