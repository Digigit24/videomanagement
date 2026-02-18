-- Add processing queue status tracking to videos
ALTER TABLE videos ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS processing_progress INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS processing_step TEXT DEFAULT NULL;

-- Index for finding videos that need processing status display
CREATE INDEX IF NOT EXISTS idx_videos_processing ON videos(processing_status) WHERE processing_status IS NOT NULL;
