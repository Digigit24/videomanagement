-- Migration V18: Client active/inactive status

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS client_active BOOLEAN DEFAULT TRUE;
