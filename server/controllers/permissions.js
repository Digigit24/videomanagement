import {
  getWorkspacePermissions,
  setWorkspacePermissions,
  getAllWorkspacePermissions,
  getDefaultPermissions,
} from "../services/permissions.js";
import { apiError } from "../utils/logger.js";

export async function getUserPermissions(req, res) {
  try {
    const { workspaceId, userId } = req.params;
    const perms = await getWorkspacePermissions(workspaceId, userId);
    res.json({ permissions: perms });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get permissions" });
  }
}

export async function getMyPermissions(req, res) {
  try {
    const { workspaceId } = req.params;
    const perms = await getWorkspacePermissions(workspaceId, req.user.id);
    res.json({ permissions: perms });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get permissions" });
  }
}

export async function updateUserPermissions(req, res) {
  try {
    const { workspaceId, userId } = req.params;
    const { permissions } = req.body;

    if (!permissions) {
      return res.status(400).json({ error: "Permissions object is required" });
    }

    // Only admin, project_manager, social_media_manager can change permissions
    const allowedRoles = ["admin", "project_manager", "social_media_manager"];
    if (!allowedRoles.includes(req.user.role)) {
      // Also check workspace-level permission
      const myPerms = await getWorkspacePermissions(workspaceId, req.user.id);
      if (!myPerms || !myPerms.can_manage_permissions) {
        return res.status(403).json({ error: "You do not have permission to manage permissions" });
      }
    }

    const updated = await setWorkspacePermissions(workspaceId, userId, permissions);
    res.json({ permissions: updated });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update permissions" });
  }
}

export async function listAllPermissions(req, res) {
  try {
    const { workspaceId } = req.params;
    const permissions = await getAllWorkspacePermissions(workspaceId);
    res.json({ permissions });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to list permissions" });
  }
}

export async function getRoleDefaults(req, res) {
  try {
    const { role } = req.params;
    const defaults = getDefaultPermissions(role);
    res.json({ permissions: defaults });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get role defaults" });
  }
}
