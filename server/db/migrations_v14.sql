-- v14: Folder share tokens
CREATE TABLE IF NOT EXISTS folder_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  token VARCHAR(128) NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id),
  require_login BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folder_share_tokens_token ON folder_share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_folder_share_tokens_folder ON folder_share_tokens(folder_id);
