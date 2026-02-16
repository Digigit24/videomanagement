-- Videos table for multi-bucket video management
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket TEXT NOT NULL,
  filename TEXT NOT NULL,
  object_key TEXT NOT NULL,
  size BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(bucket, object_key)
);

-- Index for faster bucket queries
CREATE INDEX IF NOT EXISTS idx_videos_bucket ON videos(bucket);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);

-- Index for search
CREATE INDEX IF NOT EXISTS idx_videos_filename ON videos(filename);
