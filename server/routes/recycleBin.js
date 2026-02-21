import express from "express";
import { authenticate } from "../middleware/auth.js";
import {
  deleteWorkspace,
  deleteUser,
  restoreWorkspaceItem,
  restoreUserItem,
  getRecycleBin,
  clearBin,
} from "../controllers/recycleBin.js";

const router = express.Router();

// Get recycle bin
router.get("/", authenticate, getRecycleBin);

// Clear entire recycle bin
router.post("/clear", authenticate, clearBin);

// Delete workspace
router.post("/workspace/:id/delete", authenticate, deleteWorkspace);

// Delete user
router.post("/user/:id/delete", authenticate, deleteUser);

// Restore workspace
router.post("/workspace/:id/restore", authenticate, restoreWorkspaceItem);

// Restore user
router.post("/user/:id/restore", authenticate, restoreUserItem);

export default router;
