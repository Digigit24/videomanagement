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

export type VideoStatus = 'Draft' | 'In Review' | 'Approved' | 'Published' | 'Archived';

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
  created_at: string;
  updated_at: string;
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
  inReview: number;
  published: number;
  archived: number;
}
