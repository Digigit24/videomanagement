import api from "@/lib/api";
import {
  Video,
  VideoStatus,
  Comment,
  User,
  VideoViewer,
  Workspace,
  WorkspaceAnalytics,
  Invitation,
  UserRole,
  DeletedVideo,
  Notification,
  ChatMessage,
  WorkspaceMember,
} from "@/types";

export const authService = {
  login: async (email: string, password: string) => {
    const { data } = await api.post("/login", { email, password });
    return data;
  },
};

export const userService = {
  register: async (
    name: string,
    email: string,
    password: string,
    role?: string,
  ) => {
    const { data } = await api.post("/register", {
      name,
      email,
      password,
      role,
    });
    return data.user as User;
  },

  login: async (email: string, password: string) => {
    const { data } = await api.post("/login", { email, password });
    return data;
  },

  getUsers: async () => {
    const { data } = await api.get("/users");
    return data.users as User[];
  },

  createUser: async (
    name: string,
    email: string,
    password: string,
    role: string = "member",
    isOrgMember: boolean = false,
  ) => {
    const { data } = await api.post("/register", {
      name,
      email,
      password,
      role,
      isOrgMember,
    });
    return data.user as User;
  },

  deleteUser: async (userId: string, password?: string) => {
    await api.delete(`/user/${userId}`, { data: { password } });
  },

  getCurrentUser: async () => {
    const { data } = await api.get("/user/me");
    return data.user as User;
  },

  uploadAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append("avatar", file);
    const { data } = await api.post("/user/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.user as User;
  },

  changeRole: async (userId: string, role: UserRole) => {
    const { data } = await api.patch(`/user/${userId}/role`, { role });
    return data.user as User;
  },

  getOrgMembers: async () => {
    const { data } = await api.get("/org-members");
    return data.members as User[];
  },

  toggleOrgMember: async (userId: string, isOrgMember: boolean) => {
    const { data } = await api.patch(`/user/${userId}/org-member`, {
      isOrgMember,
    });
    return data.user as User;
  },
};

export const workspaceService = {
  getWorkspaces: async () => {
    const { data } = await api.get("/workspaces");
    return data.workspaces as Workspace[];
  },

  createWorkspace: async (
    clientName: string,
    memberIds?: string[],
    projectManagerId?: string | null,
  ) => {
    const { data } = await api.post("/workspaces", {
      clientName,
      memberIds,
      projectManagerId,
    });
    return data.workspace as Workspace;
  },

  deleteWorkspace: async (id: string, password?: string) => {
    const { data } = await api.post(`/workspace/${id}/delete`, { password });
    return data;
  },

  updateWorkspace: async (
    id: string,
    clientName: string,
    clientLogo?: string,
  ) => {
    const { data } = await api.patch(`/workspace/${id}`, {
      clientName,
      clientLogo,
    });
    return data.workspace as Workspace;
  },

  uploadLogo: async (workspaceId: string, file: File) => {
    const formData = new FormData();
    formData.append("logo", file);
    const { data } = await api.post(
      `/workspace/${workspaceId}/logo`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return data.workspace as Workspace;
  },

  getMembers: async (workspaceId: string) => {
    const { data } = await api.get(`/workspace/${workspaceId}/members`);
    return data.members as WorkspaceMember[];
  },

  addMember: async (workspaceId: string, userId: string) => {
    await api.post(`/workspace/${workspaceId}/members`, { userId });
  },

  removeMember: async (workspaceId: string, userId: string) => {
    await api.delete(`/workspace/${workspaceId}/members/${userId}`);
  },

  createInvitation: async (workspaceId: string) => {
    const { data } = await api.post("/invitations", { workspaceId });
    return data.invitation as Invitation;
  },

  getInvitationInfo: async (code: string) => {
    const { data } = await api.get(`/invite/${code}`);
    return data.invitation;
  },

  acceptInvitation: async (
    code: string,
    name: string,
    email: string,
    password: string,
    role: string,
  ) => {
    const { data } = await api.post(`/invite/${code}/accept`, {
      name,
      email,
      password,
      role,
    });
    return data;
  },

  getAnalytics: async (bucket: string) => {
    const { data } = await api.get(`/workspace/${bucket}/analytics`);
    return data.analytics as WorkspaceAnalytics;
  },
};

export const bucketService = {
  getBuckets: async () => {
    const { data } = await api.get("/buckets");
    return data.buckets as string[];
  },
};

export const videoService = {
  getVideos: async (bucket: string) => {
    const { data } = await api.get("/videos", { params: { bucket } });
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
    onProgress?: (progressEvent: any) => void,
    replaceVideoId?: string,
  ) => {
    const formData = new FormData();
    formData.append("video", file);
    if (replaceVideoId) {
      formData.append("replaceVideoId", replaceVideoId);
    }
    const { data } = await api.post("/upload", formData, {
      params: { bucket },
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: onProgress,
    });
    return data.video as Video;
  },

  pollVideos: async (bucket: string) => {
    const { data } = await api.get("/videos/poll", { params: { bucket } });
    return data as { count: number; lastUpdated: string | null; lastCreated: string | null };
  },

  getThumbnailUrl: (id: string) => {
    const token = localStorage.getItem("token");
    return `https://video.celiyo.com/api/video/${id}/thumbnail?token=${token}`;
  },

  getStreamUrl: (id: string, bucket: string) => {
    const token = localStorage.getItem("token");
    return `https://video.celiyo.com/api/stream/${id}?bucket=${bucket}&token=${token}`;
  },

  getHLSUrl: (id: string, bucket: string) => {
    const token = localStorage.getItem("token");
    return `https://video.celiyo.com/api/hls/${id}/master.m3u8?bucket=${bucket}&token=${token}`;
  },

  getDownloadUrl: (id: string, bucket: string) => {
    const token = localStorage.getItem("token");
    return `https://video.celiyo.com/api/video/${id}/download?bucket=${bucket}&token=${encodeURIComponent(token || "")}`;
  },

  getVersionHistory: async (videoId: string, bucket: string) => {
    const { data } = await api.get(`/video/${videoId}/versions`, {
      params: { bucket },
    });
    return data as { versions: Video[]; currentVersionId: string };
  },

  deleteVideo: async (videoId: string, bucket: string, password?: string) => {
    await api.delete(`/video/${videoId}`, {
      params: { bucket },
      data: { password },
    });
  },

  getDeletedVideos: async (bucket: string) => {
    const { data } = await api.get("/deleted-videos", { params: { bucket } });
    return data.deleted as DeletedVideo[];
  },

  restoreVideo: async (deletedVideoId: string) => {
    await api.post(`/deleted-video/${deletedVideoId}/restore`);
  },

  recordView: async (videoId: string) => {
    await api.post(`/video/${videoId}/view`);
  },

  getViewers: async (videoId: string) => {
    const { data } = await api.get(`/video/${videoId}/viewers`);
    return data.viewers as VideoViewer[];
  },

  getShareToken: async (videoId: string) => {
    const { data } = await api.post(`/video/${videoId}/share-token`);
    return data.token as string;
  },
};

export const commentService = {
  getComments: async (videoId: string) => {
    const { data } = await api.get(`/video/${videoId}/comments`);
    return data.comments as Comment[];
  },

  addComment: async (
    videoId: string,
    content: string,
    videoTimestamp?: number,
    replyTo?: string,
    file?: File,
  ) => {
    const formData = new FormData();
    formData.append("content", content);
    if (videoTimestamp !== undefined && videoTimestamp !== null) {
      formData.append("videoTimestamp", videoTimestamp.toString());
    }
    if (replyTo) {
      formData.append("replyTo", replyTo);
    }
    if (file) {
      formData.append("attachment", file);
    }

    const { data } = await api.post(`/video/${videoId}/comments`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.comment as Comment;
  },

  deleteComment: async (commentId: string) => {
    await api.delete(`/comment/${commentId}`);
  },

  updateMarkerStatus: async (commentId: string, markerStatus: string) => {
    const { data } = await api.patch(`/comment/${commentId}/marker`, {
      markerStatus,
    });
    return data.comment as Comment;
  },
};

export const chatService = {
  getMessages: async (workspaceId: string, limit?: number, before?: string, since?: string) => {
    const params: any = {};
    if (limit) params.limit = limit;
    if (before) params.before = before;
    if (since) params.since = since;
    const { data } = await api.get(`/workspace/${workspaceId}/messages`, {
      params,
    });
    return data.messages as ChatMessage[];
  },

  sendMessage: async (
    workspaceId: string,
    content: string,
    replyTo?: string,
    mentions?: string[],
    file?: File,
    onProgress?: (percent: number) => void,
  ) => {
    const formData = new FormData();
    formData.append("content", content);
    if (replyTo) {
      formData.append("replyTo", replyTo);
    }
    if (mentions && mentions.length > 0) {
      formData.append("mentions", JSON.stringify(mentions));
    }
    if (file) {
      formData.append("attachment", file);
    }

    const { data } = await api.post(
      `/workspace/${workspaceId}/messages`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent: any) => {
          if (onProgress && progressEvent.total) {
            onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
          }
        },
      },
    );
    return data.message as ChatMessage;
  },

  deleteMessage: async (messageId: string) => {
    await api.delete(`/chat-message/${messageId}`);
  },
};

export const notificationService = {
  getNotifications: async () => {
    const { data } = await api.get("/notifications");
    return data as { notifications: Notification[]; unreadCount: number };
  },

  getUnreadCount: async () => {
    const { data } = await api.get("/notifications/count");
    return data.count as number;
  },

  markSeen: async (id: string) => {
    await api.patch(`/notification/${id}/seen`);
  },

  markAllSeen: async () => {
    await api.patch("/notifications/seen-all");
  },
};

// Public API (no auth needed - for share links, requires share token)
export const publicVideoService = {
  getVideoInfo: async (videoId: string, token?: string) => {
    const params: any = {};
    if (token) params.token = token;
    const { data } = await api.get(`/public/video/${videoId}`, { params });
    return data.video;
  },

  getStreamUrl: (videoId: string, token?: string) => {
    const base = `https://video.celiyo.com/api/public/stream/${videoId}`;
    return token ? `${base}?token=${token}` : base;
  },

  getHLSUrl: (videoId: string, token?: string) => {
    const base = `https://video.celiyo.com/api/public/hls/${videoId}/master.m3u8`;
    return token ? `${base}?token=${token}` : base;
  },

  getReviews: async (videoId: string, token?: string) => {
    const params: any = {};
    if (token) params.token = token;
    const { data } = await api.get(`/public/video/${videoId}/reviews`, { params });
    return data.reviews;
  },

  addReview: async (
    videoId: string,
    reviewerName: string,
    content: string,
    replyTo?: string,
    token?: string,
  ) => {
    const params: any = {};
    if (token) params.token = token;
    const { data } = await api.post(`/public/video/${videoId}/reviews`, {
      reviewerName,
      content,
      replyTo,
    }, { params });
    return data.review;
  },
};

export const reviewService = {
  getVideoReviews: async (videoId: string) => {
    const { data } = await api.get(`/video/${videoId}/reviews`);
    return data.reviews;
  },
};

export const recycleBinService = {
  getRecycleBin: async () => {
    const { data } = await api.get("/admin/recycle-bin");
    return data;
  },

  restoreWorkspace: async (id: string) => {
    const { data } = await api.post(
      `/admin/recycle-bin/workspace/${id}/restore`,
    );
    return data;
  },

  restoreUser: async (id: string) => {
    const { data } = await api.post(`/admin/recycle-bin/user/${id}/restore`);
    return data;
  },
};
