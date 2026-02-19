import { MAIN_BUCKET } from "../services/storage.js";
import {
  createWorkspace,
  getWorkspaces,
  getWorkspaceByBucket,
  getAnyWorkspaceByBucket,
  updateWorkspace,
  addWorkspaceMember,
  removeWorkspaceMember,
  getWorkspaceMembers,
  getUserWorkspaces,
  getWorkspaceById,
  deleteWorkspace,
} from "../services/workspace.js";
import { softDeleteWorkspace } from "../services/recycleBin.js";
import {
  createInvitation,
  getInvitationByCode,
  useInvitation,
  getWorkspaceInvitations,
  deactivateInvitation,
} from "../services/invitation.js";
import {
  createUser,
  getUserByEmail,
  getOrgMembers,
  verifyPassword,
  getUserById,
  VALID_ROLES,
} from "../services/user.js";
import { notifyWorkspaceMembers } from "../services/notification.js";
import { uploadToS3 } from "../services/upload.js";
import multer from "multer";
import { apiError } from "../utils/logger.js";
import { logActivity } from "../services/activity.js";

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
}).single("logo");

export async function listWorkspaces(req, res) {
  try {
    const workspaces = await getUserWorkspaces(req.user.id, req.user.role);
    res.json({ workspaces });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to list workspaces" });
  }
}

export async function createNewWorkspace(req, res) {
  try {
    const allowedRoles = ["admin", "project_manager", "social_media_manager"];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Only admins, project managers, and social media managers can create workspaces",
      });
    }

    const { clientName, memberIds, projectManagerId } = req.body;
    if (!clientName) {
      return res.status(400).json({ error: "Client name is required" });
    }

    // Auto-generate bucket name from client name
    let bucket = clientName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 63);

    // Check if bucket exists, if so, append a suffix
    const existingBucket = await getAnyWorkspaceByBucket(bucket);
    if (existingBucket) {
      const suffix = `-${Date.now().toString(36).slice(-4)}`;
      bucket = bucket.substring(0, 59) + suffix;
    }

    const workspace = await createWorkspace(
      bucket,
      clientName,
      null,
      req.user.id,
    );

    // Add the creating user as a member
    await addWorkspaceMember(workspace.id, req.user.id);

    // Add selected org members
    if (memberIds && Array.isArray(memberIds)) {
      for (const memberId of memberIds) {
        if (memberId !== req.user.id) {
          await addWorkspaceMember(workspace.id, memberId);
        }
      }
    }

    // Add Assigned Project Manager
    if (projectManagerId) {
      if (projectManagerId !== req.user.id) {
        await addWorkspaceMember(workspace.id, projectManagerId);
      }
    }

    // Log activity
    await logActivity(req.user.id, "workspace_created", "workspace", workspace.id, {
      clientName,
      bucket: workspace.bucket,
      memberCount: (memberIds?.length || 0) + 1,
    });

    // Notify added members
    try {
      const userName = req.user.name || req.user.email;
      await notifyWorkspaceMembers(
        workspace.id,
        req.user.id,
        "workspace_created",
        "New Workspace",
        `${userName} added you to workspace "${clientName}"`,
        "workspace",
        workspace.id,
      );
    } catch (e) {
      // Don't fail workspace creation if notification fails
      console.error("Notification error:", e);
    }

    res.status(201).json({ workspace });
  } catch (error) {
    apiError(req, error);
    res
      .status(400)
      .json({ error: error.message || "Failed to create workspace" });
  }
}

export async function updateWorkspaceDetails(req, res) {
  try {
    const allowedRoles = ["admin", "project_manager"];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id } = req.params;
    const { clientName, clientLogo } = req.body;

    const workspace = await updateWorkspace(id, clientName, clientLogo);
    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    res.json({ workspace });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to update workspace" });
  }
}

export async function uploadWorkspaceLogo(req, res) {
  logoUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const allowedRoles = ["admin", "project_manager"];
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const { id } = req.params;
      const workspace = await getWorkspaceById(id);
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }

      const objectKey = `logos/${workspace.bucket}/${Date.now()}-${req.file.originalname}`;
      await uploadToS3(
        MAIN_BUCKET || workspace.bucket, // Fallback to workspace.bucket if MAIN_BUCKET not set
        objectKey,
        req.file.buffer,
        req.file.mimetype,
      );

      const logoUrl = `/api/logo/${workspace.bucket}/${objectKey.split("/").pop()}`;
      const updated = await updateWorkspace(id, workspace.client_name, logoUrl);

      res.json({ workspace: updated });
    } catch (error) {
      apiError(req, error);
      res.status(500).json({ error: "Failed to upload logo" });
    }
  });
}

export async function getMembers(req, res) {
  try {
    const { id } = req.params;
    const members = await getWorkspaceMembers(id);
    res.json({ members });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get members" });
  }
}

export async function listOrgMembers(req, res) {
  try {
    const members = await getOrgMembers();
    res.json({ members });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get organization members" });
  }
}

export async function addMember(req, res) {
  try {
    const allowedRoles = ["admin", "project_manager"];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID required" });
    }

    await addWorkspaceMember(id, userId);

    // Log activity
    const addedUser = await getUserById(userId);
    await logActivity(req.user.id, "member_added", "workspace", id, {
      addedUserId: userId,
      addedUserName: addedUser?.name || addedUser?.email,
    });

    // Notify the added user
    try {
      const workspace = await getWorkspaceById(id);
      const userName = req.user.name || req.user.email;
      const { createNotification } =
        await import("../services/notification.js");
      await createNotification(
        userId,
        "member_added",
        "Added to Workspace",
        `${userName} added you to workspace "${workspace?.client_name || ""}"`,
        id,
        "workspace",
        id,
      );
    } catch (e) {
      console.error("Notification error:", e);
    }

    res.json({ message: "Member added" });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to add member" });
  }
}

export async function removeMember(req, res) {
  try {
    const allowedRoles = ["admin", "project_manager"];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id, userId } = req.params;

    // Prevent removing admin users from workspaces
    const removedUser = await getUserById(userId);
    if (removedUser && removedUser.role === "admin") {
      return res.status(403).json({ error: "Admin users cannot be removed from workspaces" });
    }

    // Log activity before removal
    await logActivity(req.user.id, "member_removed", "workspace", id, {
      removedUserId: userId,
      removedUserName: removedUser?.name || removedUser?.email,
    });

    await removeWorkspaceMember(id, userId);
    res.json({ message: "Member removed" });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to remove member" });
  }
}

// Invitation endpoints
export async function createInvite(req, res) {
  try {
    const allowedRoles = ["admin", "project_manager"];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Only admins and project managers can create invitations",
      });
    }

    const { workspaceId, maxUses, expiresInHours } = req.body;
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace ID is required" });
    }

    const invitation = await createInvitation(
      workspaceId,
      req.user.id,
      maxUses || 0,
      expiresInHours || 0,
    );
    res.status(201).json({ invitation });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to create invitation" });
  }
}

export async function getInviteInfo(req, res) {
  try {
    const { code } = req.params;
    const invitation = await getInvitationByCode(code);

    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found or expired" });
    }

    res.json({
      invitation: {
        id: invitation.id,
        clientName: invitation.client_name,
        bucket: invitation.bucket,
      },
    });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get invitation" });
  }
}

export async function acceptInvite(req, res) {
  try {
    const { code } = req.params;
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res
        .status(400)
        .json({ error: "Name, email, password, and role are required" });
    }

    const validRoles = ["client", "video_editor", "member"];
    if (!validRoles.includes(role)) {
      return res
        .status(400)
        .json({
          error: "Invalid role. Must be client, video_editor, or member",
        });
    }

    const invitation = await getInvitationByCode(code);
    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found or expired" });
    }

    // Create user or get existing
    let user;
    const existing = await getUserByEmail(email);
    if (existing) {
      user = existing;
    } else {
      user = await createUser(email, password, name, role);
    }

    // Add to workspace
    await addWorkspaceMember(invitation.workspace_id, user.id);
    await useInvitation(code);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      workspace: {
        bucket: invitation.bucket,
        clientName: invitation.client_name,
      },
    });
  } catch (error) {
    apiError(req, error);
    res
      .status(400)
      .json({ error: error.message || "Failed to accept invitation" });
  }
}

export async function listInvitations(req, res) {
  try {
    const { workspaceId } = req.params;
    const invitations = await getWorkspaceInvitations(workspaceId);
    res.json({ invitations });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to list invitations" });
  }
}

export async function revokeInvitation(req, res) {
  try {
    const allowedRoles = ["admin", "project_manager"];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id } = req.params;
    await deactivateInvitation(id);
    res.json({ message: "Invitation revoked" });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to revoke invitation" });
  }
}

export async function removeWorkspace(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Only admins can delete workspaces" });
    }

    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res
        .status(400)
        .json({ error: "Password is required to confirm deletion" });
    }

    // Get full user object with password hash
    const user = await getUserByEmail(req.user.email);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const workspace = await getWorkspaceById(id);
    const deleted = await softDeleteWorkspace(id);
    if (!deleted) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    // Log activity
    await logActivity(req.user.id, "workspace_deleted", "workspace", id, {
      clientName: workspace?.client_name,
      bucket: workspace?.bucket,
    });

    res.json({ message: "Workspace moved to recycle bin", workspace: deleted });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to delete workspace" });
  }
}
