import {
  createWorkspace,
  getWorkspaces,
  getWorkspaceByBucket,
  updateWorkspace,
  addWorkspaceMember,
  removeWorkspaceMember,
  getWorkspaceMembers,
  getUserWorkspaces,
  getWorkspaceById,
} from "../services/workspace.js";
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
  VALID_ROLES,
} from "../services/user.js";
import { uploadToS3 } from "../services/upload.js";
import multer from "multer";
import { apiError } from "../utils/logger.js";

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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
    const allowedRoles = ["admin", "project_manager"];
    if (!allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({
          error: "Only admins and project managers can create workspaces",
        });
    }

    const { clientName, memberIds } = req.body;
    if (!clientName) {
      return res.status(400).json({ error: "Client name is required" });
    }

    // Auto-generate bucket name from client name
    const bucket = clientName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 63); // S3 bucket name limit

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
        await addWorkspaceMember(workspace.id, memberId);
      }
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
        workspace.bucket,
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

// Get org members for workspace member picker
export async function listOrgMembers(req, res) {
  try {
    const members = await getOrgMembers();
    res.json({ members });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get organization members" });
  }
}

// Add member to workspace
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
    res.json({ message: "Member added" });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to add member" });
  }
}

// Remove member from workspace
export async function removeMember(req, res) {
  try {
    const allowedRoles = ["admin", "project_manager"];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id, userId } = req.params;
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
      return res
        .status(403)
        .json({
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

    const validRoles = ["client", "editor", "member"];
    if (!validRoles.includes(role)) {
      return res
        .status(400)
        .json({ error: "Invalid role. Must be client, editor, or member" });
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
