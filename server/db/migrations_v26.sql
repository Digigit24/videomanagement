-- Migration V26: Promised shoots tracking, scheduled_at for posts/videos.

-- 1. Add shoots_promised column to workspaces (default 0)
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS shoots_promised INTEGER DEFAULT 0;

-- 2. Create shoots table
CREATE TABLE IF NOT EXISTS shoots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  shoot_date   DATE,
  status       TEXT NOT NULL DEFAULT 'planned',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shoots_workspace_id  ON shoots(workspace_id);
CREATE INDEX IF NOT EXISTS idx_shoots_shoot_date    ON shoots(shoot_date);

-- 3. Add scheduled_at to post tables
ALTER TABLE gmb_posts
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

ALTER TABLE instagram_posts
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

ALTER TABLE linkedin_posts
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

ALTER TABLE twitter_posts
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

ALTER TABLE youtube_posts
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- 4. Indices on scheduled_at for fast calendar lookups
CREATE INDEX IF NOT EXISTS idx_gmb_posts_scheduled_at       ON gmb_posts(scheduled_at)       WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_instagram_posts_scheduled_at ON instagram_posts(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_linkedin_posts_scheduled_at  ON linkedin_posts(scheduled_at)  WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_twitter_posts_scheduled_at   ON twitter_posts(scheduled_at)   WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_youtube_posts_scheduled_at   ON youtube_posts(scheduled_at)   WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_videos_scheduled_at          ON videos(scheduled_at)          WHERE scheduled_at IS NOT NULL;
