-- Migration V20: Client page URL + PM folders for all workspaces

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS client_page_url TEXT;

-- Auto-create a PM folder for every workspace that doesn't already have one
INSERT INTO folders (workspace_id, name, created_by)
SELECT id, 'PM', NULL
FROM workspaces
WHERE deleted_at IS NULL
  AND id NOT IN (
    SELECT workspace_id FROM folders WHERE LOWER(name) = 'pm'
  );
