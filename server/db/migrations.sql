-- Multi-user system with activity tracking and comments

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Update videos table
ALTER TABLE videos
ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP WITH TIME ZONE;

-- Comments/Reviews table
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  video_timestamp INTEGER,
  reply_to UUID REFERENCES comments(id) ON DELETE SET NULL,
  marker_status TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Activity logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Video views tracking table
CREATE TABLE IF NOT EXISTS video_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(video_id, user_id)
);

-- Add new columns to comments if they don't exist
ALTER TABLE comments ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES comments(id) ON DELETE SET NULL;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS marker_status TEXT DEFAULT NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_reply ON comments(reply_to);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_video_views_video ON video_views(video_id);
CREATE INDEX IF NOT EXISTS idx_video_views_user ON video_views(user_id);
