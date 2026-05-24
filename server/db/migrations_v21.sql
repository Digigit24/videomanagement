-- v21: Add payload_template column per platform for configurable webhook bodies
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS gmb_payload_template TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ig_payload_template TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS linkedin_payload_template TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS twitter_payload_template TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS youtube_payload_template TEXT;
