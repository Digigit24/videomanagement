import {
  softDeleteWorkspace,
  softDeleteUser,
  restoreWorkspace,
  restoreUser,
  getDeletedWorkspaces,
  getDeletedUsers,
  clearEntireRecycleBin,
} from "../services/recycleBin.js";
import { getUserWithPassword, verifyPassword } from "../services/user.js";

async function checkAdminPassword(userId, password) {
  const user = await getUserWithPassword(userId);
  if (!user || user.role !== "admin") {
    return false;
  }
  return verifyPassword(password, user.password);
}

export async function deleteWorkspace(req, res) {
  const { id } = req.params;
  const { adminPassword } = req.body;

  if (!adminPassword) {
    return res.status(400).json({ error: "Admin password is required" });
  }

  const authorized = await checkAdminPassword(req.user.id, adminPassword);
  if (!authorized) {
    return res.status(403).json({ error: "Invalid admin password" });
  }

  try {
    const workspace = await softDeleteWorkspace(id);
    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }
    res.json({ message: "Workspace moved to recycle bin", workspace });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function deleteUser(req, res) {
  const { id } = req.params;
  const { adminPassword } = req.body;

  if (!adminPassword) {
    return res.status(400).json({ error: "Admin password is required" });
  }

  const authorized = await checkAdminPassword(req.user.id, adminPassword);
  if (!authorized) {
    return res.status(403).json({ error: "Invalid admin password" });
  }

  try {
    const user = await softDeleteUser(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ message: "User moved to recycle bin", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function restoreWorkspaceItem(req, res) {
  const { id } = req.params;
  // Restore does not strictly need password if user is already admin authenticated session,
  // but let's stick to auth middleware check. User didn't specify password for restore.

  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can restore items" });
  }

  try {
    const workspace = await restoreWorkspace(id);
    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }
    res.json({ message: "Workspace restored", workspace });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function restoreUserItem(req, res) {
  const { id } = req.params;

  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can restore items" });
  }

  try {
    const user = await restoreUser(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ message: "User restored", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function getRecycleBin(req, res) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can view recycle bin" });
  }

  try {
    const workspaces = await getDeletedWorkspaces();
    const users = await getDeletedUsers();
    res.json({ workspaces, users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function clearBin(req, res) {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }

  const authorized = await checkAdminPassword(req.user.id, password);
  if (!authorized) {
    return res.status(403).json({ error: "Invalid password" });
  }

  try {
    const counts = await clearEntireRecycleBin();
    res.json({
      message: "Recycle bin cleared",
      deleted: counts,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
