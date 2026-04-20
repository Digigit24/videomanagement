-- Calendar notes & scheduled posts
CREATE TABLE IF NOT EXISTS calendar_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_bucket TEXT NOT NULL,
  video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
  note_date DATE NOT NULL,
  note_time TIME,
  title TEXT NOT NULL,
  content TEXT,
  color TEXT DEFAULT 'blue',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_notes_workspace ON calendar_notes(workspace_bucket);
CREATE INDEX IF NOT EXISTS idx_calendar_notes_date ON calendar_notes(note_date);
CREATE INDEX IF NOT EXISTS idx_calendar_notes_video ON calendar_notes(video_id);
