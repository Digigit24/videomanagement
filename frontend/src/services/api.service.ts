import api from '@/lib/api';
import { Video, VideoStatus, Comment } from '@/types';

export const authService = {
  login: async (email: string, password: string) => {
    const { data } = await api.post('/login', { email, password });
    return data;
  }
};

export const userService = {
  register: async (name: string, email: string, password: string) => {
    const { data } = await api.post('/register', { name, email, password });
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

  createUser: async (name: string, email: string, password: string, role: string = 'user') => {
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

  uploadVideo: async (
    file: File,
    bucket: string,
    onProgress?: (progressEvent: any) => void
  ) => {
    const formData = new FormData();
    formData.append('video', file);

    const { data } = await api.post('/upload', formData, {
      params: { bucket },
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: onProgress,
    });

    return data.video as Video;
  },

  getStreamUrl: (id: string, bucket: string) => {
    const token = localStorage.getItem('token');
    return `/api/stream/${id}?bucket=${bucket}&token=${token}`;
  }
};

export const commentService = {
  getComments: async (videoId: string) => {
    const { data } = await api.get(`/video/${videoId}/comments`);
    return data.comments as Comment[];
  },

  addComment: async (videoId: string, content: string, videoTimestamp?: number) => {
    const { data } = await api.post(`/video/${videoId}/comments`, {
      content,
      videoTimestamp: videoTimestamp || null,
    });
    return data.comment as Comment;
  },

  deleteComment: async (commentId: string) => {
    await api.delete(`/comment/${commentId}`);
  },
};
