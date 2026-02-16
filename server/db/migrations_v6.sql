-- V6: Fix role naming and backfill workspace members
-- Update is_org_member for video_editor role (previously missed if it was 'editor')
UPDATE users SET is_org_member = TRUE 
WHERE role IN ('admin', 'video_editor', 'editor', 'project_manager', 'social_media_manager') 
AND is_org_member = FALSE;

-- Ensure all existing workspaces have their creators as members
-- This fixes the issue where members aren't fetching for older workspaces
INSERT INTO workspace_members (workspace_id, user_id)
SELECT id, created_by FROM workspaces
WHERE created_by IS NOT NULL
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Also add video uploaders as members of the workspace they uploaded to
-- This ensures they can see the workspace and its chat
INSERT INTO workspace_members (workspace_id, user_id)
SELECT DISTINCT w.id, v.uploaded_by 
FROM videos v
JOIN workspaces w ON v.bucket = w.bucket
WHERE v.uploaded_by IS NOT NULL
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Fix any legacy marker_status case sensitivity issues if any exist
UPDATE comments SET marker_status = LOWER(marker_status) 
WHERE marker_status IS NOT NULL;
