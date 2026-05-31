-- Migration V25: Shared agency-level Composio connections.
-- One shared connection can be mapped to many client workspaces.

CREATE TABLE IF NOT EXISTS agency_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  toolkit TEXT NOT NULL,
  composio_user_id TEXT NOT NULL DEFAULT 'agencyos_shared',
  auth_config_id TEXT,
  connected_account_id TEXT,
  connection_request_id TEXT,
  status TEXT DEFAULT 'not_connected',
  label TEXT,
  last_checked_at TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(toolkit, connected_account_id)
);

CREATE INDEX IF NOT EXISTS idx_agency_integrations_toolkit
  ON agency_integrations(toolkit);

CREATE INDEX IF NOT EXISTS idx_agency_integrations_connected_account_id
  ON agency_integrations(connected_account_id);
