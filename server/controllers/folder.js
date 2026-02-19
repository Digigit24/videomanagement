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
