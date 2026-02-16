-- Video Versioning & Version History
ALTER TABLE videos ADD COLUMN IF NOT EXISTS version_group_id UUID DEFAULT gen_random_uuid();
ALTER TABLE videos ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_active_version BOOLEAN DEFAULT TRUE;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS parent_video_id UUID REFERENCES videos(id) ON DELETE SET NULL;

-- Index for version group queries
CREATE INDEX IF NOT EXISTS idx_videos_version_group ON videos(version_group_id);
CREATE INDEX IF NOT EXISTS idx_videos_active_version ON videos(version_group_id, is_active_version);

-- Deleted videos backup table (for approved video history cleanup)
CREATE TABLE IF NOT EXISTS deleted_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_video_id UUID NOT NULL,
  version_group_id UUID,
  version_number INTEGER DEFAULT 1,
  bucket TEXT NOT NULL,
  filename TEXT NOT NULL,
  object_key TEXT NOT NULL,
  size BIGINT NOT NULL,
  status TEXT,
  hls_ready BOOLEAN DEFAULT FALSE,
  hls_path TEXT,
  uploaded_by UUID,
  uploaded_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '3 days'),
  created_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_deleted_videos_expires ON deleted_videos(expires_at);
CREATE INDEX IF NOT EXISTS idx_deleted_videos_group ON deleted_videos(version_group_id);

-- Update roles check: now valid roles are admin, editor, client, member, project_manager, social_media_manager
-- No constraint change needed since role is TEXT, but we document this here

-- Ensure workspace_members table has needed indexes
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
