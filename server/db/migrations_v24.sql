-- Migration V24: Workspace Composio connection registry.
-- Stores only connection metadata and lightweight read-only summaries.

CREATE TABLE IF NOT EXISTS workspace_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  toolkit TEXT NOT NULL,
  composio_user_id TEXT NOT NULL,
  auth_config_id TEXT,
  connected_account_id TEXT,
  connection_request_id TEXT,
  status TEXT DEFAULT 'not_connected',
  label TEXT,
  selected_resource JSONB DEFAULT '{}'::jsonb,
  latest_summary JSONB DEFAULT '{}'::jsonb,
  last_checked_at TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, toolkit, connected_account_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_integrations_workspace_id
  ON workspace_integrations(workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_integrations_connected_account_id
  ON workspace_integrations(connected_account_id);
