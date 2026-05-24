-- Migration V19: Client bookmarks
CREATE TABLE IF NOT EXISTS workspace_bookmarks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_bookmarks_workspace_id ON workspace_bookmarks(workspace_id);
