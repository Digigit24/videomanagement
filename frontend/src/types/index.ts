export interface Video {
  id: string;
  bucket: string;
  filename: string;
  object_key: string;
  size: number;
  status: VideoStatus;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  uploaded_by_email: string | null;
  uploaded_at: string | null;
  created_at: string;
  updated_at: string;
}

export type VideoStatus = 'Pending' | 'Under Review' | 'Approved' | 'Changes Needed' | 'Rejected';

export interface User {
  id?: string;
  email: string;
  name?: string;
  role?: string;
  token?: string;
  created_at?: string;
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
  marker_status: 'pending' | 'working' | 'done' | null;
  created_at: string;
  updated_at: string;
}

export interface VideoViewer {
  user_id: string;
  name: string;
  email: string;
  viewed_at: string;
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
  pending: number;
  underReview: number;
  approved: number;
  changesNeeded: number;
  rejected: number;
}
