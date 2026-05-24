-- Migration V17: AgencyOS Campaigns and Workspaces Deliverables Setup

-- 1. Alter workspaces table to support active platforms, deliverables, and webhooks
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS active_platforms TEXT DEFAULT 'gmb,instagram';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS gmb_promised INTEGER DEFAULT 10;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS instagram_promised INTEGER DEFAULT 15;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS linkedin_promised INTEGER DEFAULT 10;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS twitter_promised INTEGER DEFAULT 15;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS youtube_promised INTEGER DEFAULT 5;

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS gmb_webhook_url TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS gmb_webhook_headers TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS gmb_webhook_active BOOLEAN DEFAULT false;

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ig_webhook_url TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ig_webhook_headers TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ig_webhook_active BOOLEAN DEFAULT false;

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS linkedin_webhook_url TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS linkedin_webhook_headers TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS linkedin_webhook_active BOOLEAN DEFAULT false;

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS twitter_webhook_url TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS twitter_webhook_headers TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS twitter_webhook_active BOOLEAN DEFAULT false;

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS youtube_webhook_url TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS youtube_webhook_headers TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS youtube_webhook_active BOOLEAN DEFAULT false;

-- 2. Create GMB Posts table linked to workspaces
CREATE TABLE IF NOT EXISTS gmb_posts (
  id SERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  mediaurl VARCHAR(2048),
  status VARCHAR(50) DEFAULT 'queued',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gmb_posts_workspace ON gmb_posts(workspace_id);

-- 3. Create Instagram Posts table
CREATE TABLE IF NOT EXISTS instagram_posts (
  id SERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  caption TEXT NOT NULL,
  mediaurl VARCHAR(2048),
  status VARCHAR(50) DEFAULT 'queued',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_workspace ON instagram_posts(workspace_id);

-- 4. Create LinkedIn Posts table
CREATE TABLE IF NOT EXISTS linkedin_posts (
  id SERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  mediaurl VARCHAR(2048),
  status VARCHAR(50) DEFAULT 'queued',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_linkedin_posts_workspace ON linkedin_posts(workspace_id);

-- 5. Create Twitter Posts table
CREATE TABLE IF NOT EXISTS twitter_posts (
  id SERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tweet_text TEXT NOT NULL,
  mediaurl VARCHAR(2048),
  status VARCHAR(50) DEFAULT 'queued',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_twitter_posts_workspace ON twitter_posts(workspace_id);

-- 6. Create YouTube Posts table
CREATE TABLE IF NOT EXISTS youtube_posts (
  id SERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  video_title VARCHAR(255) NOT NULL,
  description TEXT,
  video_url VARCHAR(2048),
  status VARCHAR(50) DEFAULT 'queued',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_youtube_posts_workspace ON youtube_posts(workspace_id);
