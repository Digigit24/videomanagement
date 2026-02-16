# Video Management Tool - Feature Implementation Plan

## Features to Implement

### 1. Video Versioning System

- Videos linked in a parent-child chain (version_group_id + version_number)
- When editor uploads a new version of a video, it replaces the current as the "active" version
- Version history panel in VideoDetail page to jump between versions
- On approval: old versions moved to "deleted_videos" backup table
- Backup can be restored within 3 days; after 3 days, permanently deleted (cron/cleanup)
- Status from most recent video version carries forward

### 2. New Roles: Social Media Manager & Project Manager

- Add 'social_media_manager' and 'project_manager' to roles
- Both have access to all invited client data
- Both can upload and delete videos
- Update workspace visibility logic
- Update role selector on invite page and user management

### 3. Download Approved Video Button

- Button on VideoDetail page when status is "Approved"
- Generates a download link from S3

### 4. Auto-create Bucket on Client Creation

- When admin creates a new client workspace, S3 bucket is automatically created
- Bucket name derived from client name (slugified)

### 5. Workspace Creation with Image, Members

- Upload client logo image (already partially exists)
- Show existing org members (admin, editor, PM, SM) to add directly
- Client members invited via link (already exists)
- Select which org members to add to workspace on creation

### 6. Status Change Confirmation Dialog

- Add confirmation dialog before changing video status
- Show current status → new status

### 7. Image Upload for Avatars

- Already partially implemented. Ensure it works end-to-end.
