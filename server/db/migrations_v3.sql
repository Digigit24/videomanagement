-- V3: Organization member flag, notifications

-- Add is_org_member flag to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_org_member BOOLEAN DEFAULT FALSE;

-- Mark existing admin/editor/project_manager/social_media_manager as org members
UPDATE users SET is_org_member = TRUE WHERE role IN ('admin', 'editor', 'project_manager', 'social_media_manager') AND is_org_member = FALSE;

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type TEXT,
  entity_id UUID,
  seen BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, seen);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
