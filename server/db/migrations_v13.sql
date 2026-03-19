-- v13: Account-gated access for share links
ALTER TABLE video_share_tokens ADD COLUMN IF NOT EXISTS require_login BOOLEAN DEFAULT false;
