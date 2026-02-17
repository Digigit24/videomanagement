-- v9: Posted status, workspace analytics, auto-cleanup tracking

-- Table to track historical video stats per workspace (survives video deletion)
CREATE TABLE IF NOT EXISTS workspace_video_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_bucket TEXT NOT NULL,
  video_id UUID NOT NULL,
  video_filename TEXT NOT NULL,
  status_changed_to TEXT NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wvs_bucket ON workspace_video_stats(workspace_bucket);
CREATE INDEX IF NOT EXISTS idx_wvs_status ON workspace_video_stats(status_changed_to);
CREATE INDEX IF NOT EXISTS idx_wvs_changed_at ON workspace_video_stats(changed_at);

-- Track when a Posted video was marked for auto-cleanup
ALTER TABLE videos ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP WITH TIME ZONE;

-- Thumbnail for video preview
ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_key TEXT;
