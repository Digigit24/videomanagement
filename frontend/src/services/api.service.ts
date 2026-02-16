import api from '@/lib/api';
import { Video, VideoStatus, Comment, User, VideoViewer, Workspace, Invitation, UserRole } from '@/types';

export const authService = {
  login: async (email: string, password: string) => {
    const { data } = await api.post('/login', { email, password });
    return data;
  }
};

export const userService = {
  register: async (name: string, email: string, password: string, role?: string) => {
    const { data } = await api.post('/register', { name, email, password, role });
    return data.user as User;
  },

  login: async (email: string, password: string) => {
    const { data } = await api.post('/login', { email, password });
    return data;
  },

  getUsers: async () => {
    const { data } = await api.get('/users');
    return data.users as User[];
  },

  createUser: async (name: string, email: string, password: string, role: string = 'member') => {
    const { data } = await api.post('/register', { name, email, password, role });
    return data.user as User;
  },

  deleteUser: async (userId: string) => {
    await api.delete(`/user/${userId}`);
  },

  getCurrentUser: async () => {
    const { data } = await api.get('/user/me');
    return data.user as User;
  },

  uploadAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const { data } = await api.post('/user/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.user as User;
  },

  changeRole: async (userId: string, role: UserRole) => {
    const { data } = await api.patch(`/user/${userId}/role`, { role });
    return data.user as User;
  },
};

export const workspaceService = {
  getWorkspaces: async () => {
    const { data } = await api.get('/workspaces');
    return data.workspaces as Workspace[];
  },

  createWorkspace: async (bucket: string, clientName: string) => {
    const { data } = await api.post('/workspaces', { bucket, clientName });
    return data.workspace as Workspace;
  },

  updateWorkspace: async (id: string, clientName: string, clientLogo?: string) => {
    const { data } = await api.patch(`/workspace/${id}`, { clientName, clientLogo });
    return data.workspace as Workspace;
  },

  uploadLogo: async (workspaceId: string, file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    const { data } = await api.post(`/workspace/${workspaceId}/logo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.workspace as Workspace;
  },

  getMembers: async (workspaceId: string) => {
    const { data } = await api.get(`/workspace/${workspaceId}/members`);
    return data.members;
  },

  createInvitation: async (workspaceId: string) => {
    const { data } = await api.post('/invitations', { workspaceId });
    return data.invitation as Invitation;
  },

  getInvitationInfo: async (code: string) => {
    const { data } = await api.get(`/invite/${code}`);
    return data.invitation;
  },

  acceptInvitation: async (code: string, name: string, email: string, password: string, role: string) => {
    const { data } = await api.post(`/invite/${code}/accept`, { name, email, password, role });
    return data;
  },
};

export const bucketService = {
  getBuckets: async () => {
    const { data } = await api.get('/buckets');
    return data.buckets as string[];
  }
};

export const videoService = {
  getVideos: async (bucket: string) => {
    const { data } = await api.get('/videos', { params: { bucket } });
    return data.videos as Video[];
  },

  getVideo: async (id: string, bucket: string) => {
    const { data } = await api.get(`/video/${id}`, { params: { bucket } });
    return data.video as Video;
  },

  updateStatus: async (id: string, status: VideoStatus) => {
    const { data } = await api.patch(`/video/${id}/status`, { status });
    return data.video as Video;
  },

  uploadVideo: async (file: File, bucket: string, onProgress?: (progressEvent: any) => void) => {
    const formData = new FormData();
    formData.append('video', file);
    const { data } = await api.post('/upload', formData, {
      params: { bucket },
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    });
    return data.video as Video;
  },

  getStreamUrl: (id: string, bucket: string) => {
    const token = localStorage.getItem('token');
    return `/api/stream/${id}?bucket=${bucket}&token=${token}`;
  },

  getHLSUrl: (id: string, bucket: string) => {
    const token = localStorage.getItem('token');
    return `/api/hls/${id}/master.m3u8?bucket=${bucket}&token=${token}`;
  },

  recordView: async (videoId: string) => {
    await api.post(`/video/${videoId}/view`);
  },

  getViewers: async (videoId: string) => {
    const { data } = await api.get(`/video/${videoId}/viewers`);
    return data.viewers as VideoViewer[];
  },
};

export const commentService = {
  getComments: async (videoId: string) => {
    const { data } = await api.get(`/video/${videoId}/comments`);
    return data.comments as Comment[];
  },

  addComment: async (videoId: string, content: string, videoTimestamp?: number, replyTo?: string) => {
    const { data } = await api.post(`/video/${videoId}/comments`, {
      content,
      videoTimestamp: videoTimestamp ?? null,
      replyTo: replyTo || null,
    });
    return data.comment as Comment;
  },

  deleteComment: async (commentId: string) => {
    await api.delete(`/comment/${commentId}`);
  },

  updateMarkerStatus: async (commentId: string, markerStatus: string) => {
    const { data } = await api.patch(`/comment/${commentId}/marker`, { markerStatus });
    return data.comment as Comment;
  },
};
