export interface Video {
  id: string;
  bucket: string;
  filename: string;
  object_key: string;
  size: number;
  status: VideoStatus;
  hls_ready: boolean;
  hls_path: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  uploaded_by_email: string | null;
  uploaded_at: string | null;
  created_at: string;
  updated_at: string;
  version_group_id: string | null;
  version_number: number;
  is_active_version: boolean;
  parent_video_id: string | null;
}

export type VideoStatus =
  | "Draft"
  | "Pending"
  | "Under Review"
  | "Approved"
  | "Changes Needed"
  | "Rejected";

export type UserRole =
  | "admin"
  | "video_editor"
  | "client"
  | "member"
  | "project_manager"
  | "social_media_manager";

export interface User {
  id?: string;
  email: string;
  name?: string;
  role?: UserRole;
  avatar_url?: string | null;
  is_org_member?: boolean;
  token?: string;
  created_at?: string;
  deleted_at?: string;
}

export interface Comment {
  id: string;
  video_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  content: string;
  video_timestamp: number | null;
  reply_to: string | null;
  reply_content: string | null;
  reply_user_id: string | null;
  reply_user_name: string | null;
  marker_status: "pending" | "working" | "done" | null;
  created_at: string;
  updated_at: string;
  attachment?: {
    filename: string;
    url: string;
  };
}

export interface ChatMessage {
  id: string;
  workspace_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_avatar: string | null;
  content: string;
  reply_to: string | null;
  reply_content: string | null;
  reply_user_id: string | null;
  reply_user_name: string | null;
  mentions: string[];
  created_at: string;
  updated_at: string;
  attachments: ChatAttachment[];
}

export interface ChatAttachment {
  id: string;
  filename: string;
  object_key: string;
  size: number;
  content_type: string;
  url: string;
}

export interface VideoViewer {
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  viewed_at: string;
}

export interface Workspace {
  id: string;
  bucket: string;
  client_name: string;
  client_logo: string | null;
  created_by: string;
  created_by_name: string;
  video_count: number;
  member_count: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface Invitation {
  id: string;
  code: string;
  workspace_id: string;
  created_by_name: string;
  max_uses: number;
  use_count: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}

export interface Activity {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: any;
  created_at: string;
}

export interface DashboardStats {
  total: number;
  draft: number;
  pending: number;
  underReview: number;
  approved: number;
  changesNeeded: number;
  rejected: number;
}

export interface DeletedVideo {
  id: string;
  original_video_id: string;
  version_group_id: string | null;
  version_number: number;
  bucket: string;
  filename: string;
  object_key: string;
  size: number;
  status: string | null;
  deleted_at: string;
  expires_at: string;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  workspace_id: string | null;
  workspace_name: string | null;
  workspace_bucket: string | null;
  entity_type: string | null;
  entity_id: string | null;
  seen: boolean;
  created_at: string;
}

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  joined_at: string;
}
