-- v23: Add promised video deliverable count per workspace.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS video_promised INTEGER DEFAULT 0;
