-- Migration V12: Folders, Photo Creatives, Per-Workspace Permissions, New Roles

-- 1. Add new roles to the system: videographer, photo_editor
-- (roles are stored as text in users table, just need to update validation)

-- 2. Folders table - each workspace can have multiple folders
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_folders_workspace ON folders(workspace_id);

-- 3. Link videos to folders
ALTER TABLE videos ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_videos_folder ON videos(folder_id);

-- 4. Media type column for videos table to support photos
ALTER TABLE videos ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'video';
-- media_type can be 'video' or 'photo'

-- 5. Photo creatives table (shares structure with videos for independent feedback)
-- We reuse the videos table with media_type='photo' to avoid duplication
-- Photos won't need HLS processing but will have their own comments/chat

-- 6. Per-workspace permissions table
CREATE TABLE IF NOT EXISTS workspace_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_upload BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  can_change_status BOOLEAN DEFAULT FALSE,
  can_change_video_status BOOLEAN DEFAULT FALSE,
  can_add_member BOOLEAN DEFAULT FALSE,
  can_remove_member BOOLEAN DEFAULT FALSE,
  can_create_folder BOOLEAN DEFAULT FALSE,
  can_delete_folder BOOLEAN DEFAULT FALSE,
  can_manage_permissions BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, user_id)
);

-- Add can_delete_folder column if table already exists
ALTER TABLE workspace_permissions ADD COLUMN IF NOT EXISTS can_delete_folder BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_workspace_permissions_workspace ON workspace_permissions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_permissions_user ON workspace_permissions(user_id);

-- 7. Deleted videos permanent delete support - add a flag
-- (deleted_videos table already exists, we just need a permanent delete endpoint)

-- 8. Ensure workspace_members has proper indexes
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
