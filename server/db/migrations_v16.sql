-- v16: External video folder manifest API metadata

ALTER TABLE videos ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC;

CREATE TABLE IF NOT EXISTS video_approved_metadata (
  video_id UUID PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
  labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  scenes JSONB NOT NULL DEFAULT '[]'::jsonb,
  transcript_summary TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS video_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_version TEXT,
  status TEXT NOT NULL,
  labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  scenes JSONB NOT NULL DEFAULT '[]'::jsonb,
  transcript JSONB,
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_video_analysis_runs_video ON video_analysis_runs(video_id);
CREATE INDEX IF NOT EXISTS idx_video_analysis_runs_created ON video_analysis_runs(created_at);
