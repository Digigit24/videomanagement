-- Migration v8: Video reviews (client feedback via share links)
-- Each review is scoped to a specific video (isolated thread)

CREATE TABLE IF NOT EXISTS video_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL,
  content TEXT NOT NULL,
  reply_to UUID REFERENCES video_reviews(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_video_reviews_video ON video_reviews(video_id, created_at);

-- Share tokens for public access to videos (no login needed)
CREATE TABLE IF NOT EXISTS video_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_video_share_tokens_token ON video_share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_video_share_tokens_video ON video_share_tokens(video_id);
