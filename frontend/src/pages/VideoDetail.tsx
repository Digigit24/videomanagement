import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBucket } from '@/hooks/useBucket';
import { videoService, commentService, workspaceService, activityService } from '@/services/api.service';
import { APP_URL } from '@/lib/api';
import { Video, VideoStatus, Comment, VideoViewer, ProcessingStatus, Activity } from '@/types';
import { formatBytes, formatDate, getApiUrl } from '@/lib/utils';
import HLSPlayer from '@/components/HLSPlayer';
import CommentsSection from '@/components/CommentsSection';
import TimestampPanel from '@/components/TimestampPanel';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Eye, Download, Trash2, Clock, Sparkles, Link2, Copy, Check, MessageSquare, MessageCircle, RefreshCw } from 'lucide-react';
import UploadModal from '@/components/UploadModal';
import WorkspaceChat from '@/components/WorkspaceChat';
import ReactPlayer from 'react-player';
import { formatDistanceToNow } from 'date-fns';

const statusOptions: VideoStatus[] = ['Draft', 'Pending', 'Under Review', 'Approved', 'Changes Needed', 'Rejected', 'Posted'];

const statusColors: Record<VideoStatus, string> = {
  'Draft': 'bg-slate-100 text-slate-700 border-slate-200',
  'Pending': 'bg-amber-100 text-amber-800 border-amber-200',
  'Under Review': 'bg-blue-100 text-blue-800 border-blue-200',
  'Approved': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Changes Needed': 'bg-orange-100 text-orange-800 border-orange-200',
  'Rejected': 'bg-red-100 text-red-800 border-red-200',
  'Posted': 'bg-violet-100 text-violet-800 border-violet-200',
};

function formatProcessingStep(step: string | null): string {
  if (!step) return 'Processing...';
  const stepMap: Record<string, string> = {
    downloading: 'Downloading from storage...',
    generating_thumbnail: 'Generating thumbnail...',
    transcoding_360p: 'Transcoding to 360p...',
    transcoding_720p: 'Transcoding to 720p...',
    transcoding_1080p: 'Transcoding to 1080p...',
    transcoding_4k: 'Transcoding to 4K...',
    uploading_360p: 'Uploading 360p chunks...',
    uploading_720p: 'Uploading 720p chunks...',
    uploading_1080p: 'Uploading 1080p chunks...',
    uploading_4k: 'Uploading 4K chunks...',
    finalizing: 'Finalizing...',
    completed: 'Complete!',
    error: 'Error occurred',
  };
  return stepMap[step] || `Processing (${step})...`;
}

function isRecentUpload(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const uploadTime = new Date(dateStr).getTime();
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return (now - uploadTime) < twentyFourHours;
}

function ActivityLog({ videoId }: { videoId: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivities();
  }, [videoId]);

  const loadActivities = async () => {
    try {
      setLoading(true);
      const data = await activityService.getEntityActivities('video', videoId);
      setActivities(data);
    } catch (error) {
      console.error('Failed to load activities:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 sm:h-64 text-gray-400">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-3"></div>
        <p className="text-xs">Loading activity log...</p>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 sm:h-64 text-gray-400">
        <Clock className="w-8 h-8 mb-2 opacity-20" />
        <p className="text-xs">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/30">
      <div className="p-4 space-y-4">
        {activities.map((activity) => (
          <div key={activity.id} className="flex gap-3 relative pb-4 last:pb-0">
            {/* Timeline Line */}
            <div className="absolute left-[15px] top-8 bottom-0 w-px bg-gray-200 last:hidden" />
            
            <div className="flex-shrink-0 mt-1">
               <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600">
                  {activity.user_name?.charAt(0).toUpperCase() || '?'}
               </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-gray-900">{activity.user_name}</span>
                <span className="text-[10px] text-gray-400">
                  {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                </span>
              </div>
              
              <div className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                {activity.action === 'video_uploaded' && (
                  <p>Uploaded the video <span className="font-medium text-gray-800">{activity.details?.filename}</span></p>
                )}
                {activity.action === 'status_changed' && (
                   <p>Changed status from <span className="font-medium text-gray-500 line-through">{activity.details?.oldStatus}</span> to <span className={`font-medium ${statusColors[activity.details?.newStatus as VideoStatus] || 'text-gray-800'} px-1.5 py-0.5 rounded ml-1`}>{activity.details?.newStatus}</span></p>
                )}
                {activity.action === 'comment_added' && (
                  <p>Added a {activity.details?.timestamp ? 'timestamped ' : ''}comment</p>
                )}
                {activity.action === 'marker_status_changed' && (
                   <p>Updated timeline marker status</p>
                )}
                {/* Fallback for unknown actions */}
                {!['video_uploaded', 'status_changed', 'comment_added', 'marker_status_changed'].includes(activity.action) && (
                   <p>{activity.action.replace(/_/g, ' ')}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function VideoDetail() {
  const { id, bucket } = useParams<{ id: string; bucket?: string }>();
  const { currentBucket: contextBucket } = useBucket();
  const currentBucket = bucket || contextBucket;
  const navigate = useNavigate();
  const playerRef = useRef<ReactPlayer>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [viewers, setViewers] = useState<VideoViewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [hlsPlayerControls, setHlsPlayerControls] = useState<{ seekTo: (time: number) => void; pause: () => void } | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [showShareLinks, setShowShareLinks] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [loadingShareToken, setLoadingShareToken] = useState(false);

  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);

  const [sidebarTab, setSidebarTab] = useState<'feedback' | 'chat' | 'activity'>('chat');

  // Auto-pause video when switching to feedback tab
  const handleTabSwitch = useCallback((tab: 'feedback' | 'chat' | 'activity') => {
    setSidebarTab(tab);
    if (tab === 'feedback' && isVideoPlaying) {
      // Pause video when user switches to feedback while video is playing
      if (hlsPlayerControls) {
        hlsPlayerControls.pause();
      } else if (playerRef.current) {
        const internalPlayer = playerRef.current.getInternalPlayer();
        if (internalPlayer && typeof internalPlayer.pause === 'function') {
          internalPlayer.pause();
        }
      }
    }
  }, [isVideoPlaying, hlsPlayerControls]);

  // Auto-switch to feedback and pause when user starts typing feedback while video plays
  const handleFeedbackTypingStart = useCallback(() => {
    if (isVideoPlaying) {
      if (hlsPlayerControls) {
        hlsPlayerControls.pause();
      } else if (playerRef.current) {
        const internalPlayer = playerRef.current.getInternalPlayer();
        if (internalPlayer && typeof internalPlayer.pause === 'function') {
          internalPlayer.pause();
        }
      }
    }
  }, [isVideoPlaying, hlsPlayerControls]);
  const [confirmStatus, setConfirmStatus] = useState<{ open: boolean; newStatus: VideoStatus | null }>({
    open: false,
    newStatus: null,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const handleUploadComplete = (newVideo?: any) => {
    if (newVideo && newVideo.id && newVideo.id !== id) {
      // Navigate to new video version
      if (currentBucket) {
        navigate(`/workspace/${currentBucket}/video/${newVideo.id}`);
      } else {
        navigate(`/v/${newVideo.id}`);
      }
    } else {
      loadVideo();
    }
  };

  const userRole = localStorage.getItem('userRole');
  const isAdmin = userRole === 'admin';
  const isPM = userRole === 'project_manager';
  const isClient = userRole === 'client';

  // Only admin, project_manager, client can change video status
  const canChangeStatus = isAdmin || isPM || isClient;
  // All org members (except client) can change marker/timestamp feedback status
  const canChangeMarkerStatus = ['admin', 'video_editor', 'project_manager', 'social_media_manager', 'member'].includes(userRole || '');

  const canDelete = ['admin', 'video_editor', 'project_manager', 'social_media_manager'].includes(userRole || '');

  useEffect(() => {
    if (id && currentBucket) {
      loadVideo();
      loadComments();
      loadViewers();
      loadWorkspace();
      videoService.recordView(id).catch(() => {});
    }
  }, [id, currentBucket]);

  // Short polling: refresh comments every 4 seconds for near-real-time feedback
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(async () => {
      try {
        const data = await commentService.getComments(id);
        setComments(data);
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, [id]);

  // Poll for processing status when video is not HLS-ready yet (skip for photos)
  useEffect(() => {
    if (!id || !currentBucket || !video || video.hls_ready || video.media_type === 'photo') return;

    // Fetch processing status immediately
    videoService.getProcessingStatus(id).then(setProcessingStatus).catch(() => {});

    const interval = setInterval(async () => {
      try {
        // Fetch both video data and processing status
        const [videoData, procStatus] = await Promise.all([
          videoService.getVideo(id, currentBucket),
          videoService.getProcessingStatus(id),
        ]);
        setProcessingStatus(procStatus);
        if (videoData.hls_ready) {
          setVideo(videoData);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [id, currentBucket, video?.hls_ready]);

  const loadWorkspace = async () => {
    if (!currentBucket) return;
    try {
      const workspaces = await workspaceService.getWorkspaces();
      const ws = workspaces.find(w => w.bucket === currentBucket);
      if (ws) setWorkspaceId(ws.id);
    } catch (error) {
      // Non-critical, silently fail
    }
  };

  const loadVideo = async () => {
    if (!id || !currentBucket) return;
    setLoading(true);
    try {
      const data = await videoService.getVideo(id, currentBucket);
      setVideo(data);
    } catch (error) {
      console.error('Failed to load video:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async () => {
    if (!id) return;
    try {
      const data = await commentService.getComments(id);
      setComments(data);
    } catch (error) {
      console.error('Failed to load comments:', error);
    }
  };

  const loadViewers = async () => {
    if (!id) return;
    try {
      const data = await videoService.getViewers(id);
      setViewers(data);
    } catch (error) {
      console.error('Failed to load viewers:', error);
    }
  };

  const handleStatusChangeRequest = (status: VideoStatus) => {
    if (status === video?.status) return;
    setConfirmStatus({ open: true, newStatus: status });
  };

  const handleStatusConfirm = async () => {
    if (!video || !confirmStatus.newStatus) return;
    const status = confirmStatus.newStatus;
    const previousStatus = video.status;

    setConfirmStatus({ open: false, newStatus: null });
    setVideo({ ...video, status, updated_at: new Date().toISOString() });
    setUpdating(true);

    try {
      await videoService.updateStatus(video.id, status);
    } catch (error) {
      console.error('Failed to update status:', error);
      setVideo({ ...video, status: previousStatus });
    } finally {
      setUpdating(false);
    }
  };

  const handleProgress = useCallback((state: { played: number; playedSeconds: number }) => {
    setCurrentTime(state.playedSeconds);
  }, []);

  const handleSeekTo = useCallback((time: number) => {
    if (video?.hls_ready && hlsPlayerControls) {
      hlsPlayerControls.seekTo(time);
    } else if (playerRef.current) {
      playerRef.current.seekTo(time, 'seconds');
    }
  }, [video?.hls_ready, hlsPlayerControls]);

  const handleCommentAdded = (comment: Comment) => {
    setComments(prev => [...prev, comment]);
  };

  const handleCommentDeleted = (commentId: string) => {
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  const handleMarkerStatusUpdate = (commentId: string, newStatus: string) => {
    setComments(prev =>
      prev.map(c => c.id === commentId ? { ...c, marker_status: newStatus as Comment['marker_status'] } : c)
    );
  };

  const [deleteError, setDeleteError] = useState('');

  const handleDeleteVideo = async (password?: string) => {
    if (!id || !currentBucket) return;
    setDeleteError('');
    try {
      await videoService.deleteVideo(id, currentBucket, password);
      setConfirmDelete(false);
      navigate(`/workspace/${currentBucket}`);
    } catch (error: any) {
      console.error('Delete error:', error);
      const status = error?.response?.status;
      let msg = error?.response?.data?.error || 'Failed to delete video.';
      
      if (status === 403) {
        msg = 'Invalid admin password. Please try again.';
      } else if (status === 400) {
        msg = 'Admin password is required.';
      }
      
      setDeleteError(msg);
    }
  };

  const handleDownload = () => {
    if (!video || !currentBucket) return;
    const url = videoService.getDownloadUrl(video.id, currentBucket);
    window.open(url, '_blank');
  };

  const getVideoShareUrl = () => {
    if (!video || !shareToken) return '';
    return `${APP_URL}/v/${video.id}?token=${shareToken}`;
  };

  const getReviewShareUrl = () => {
    if (!video || !shareToken) return '';
    return `${APP_URL}/v/${video.id}/review?token=${shareToken}`;
  };

  const [shareError, setShareError] = useState(false);

  const handleOpenSharePanel = async () => {
    const opening = !showShareLinks;
    setShowShareLinks(opening);
    if (opening && !shareToken && video) {
      setLoadingShareToken(true);
      setShareError(false);
      try {
        const token = await videoService.getShareToken(video.id);
        setShareToken(token);
      } catch (error) {
        console.error('Failed to generate share token:', error);
        setShareError(true);
      } finally {
        setLoadingShareToken(false);
      }
    }
  };

  const handleCopyLink = async (url: string, type: string) => {
    if (!url) {
      alert('Share link is not ready yet. Please wait...');
      return;
    }
    try {
      // Try modern clipboard API first
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopiedLink(type);
        setTimeout(() => setCopiedLink(null), 2500);
        return;
      }
    } catch (e) {
      console.warn("Clipboard API failed", e);
    }

    try {
      // Fallback: textarea + execCommand
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (success) {
        setCopiedLink(type);
        setTimeout(() => setCopiedLink(null), 2500);
        return;
      }
    } catch (e) {
      // execCommand also failed
    }

    // Last resort: show prompt for manual copy
    window.prompt('Copy this link manually:', url);
  };

  if (loading || !video || !currentBucket) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading video...</p>
        </div>
      </div>
    );
  }

  const streamUrl = videoService.getStreamUrl(video.id, currentBucket);
  const hlsUrl = videoService.getHLSUrl(video.id, currentBucket);
  const downloadUrl = videoService.getDownloadUrl(video.id, currentBucket);
  const timestampComments = comments.filter(c => c.video_timestamp !== null);
  const isNew = isRecentUpload(video.uploaded_at || video.created_at);

  return (
    <div className="space-y-0 animate-fade-in">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (currentBucket) {
                navigate(`/workspace/${currentBucket}`);
              } else {
                navigate('/');
              }
            }}
            className="text-gray-500 hover:text-gray-700 flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <div className="h-4 w-px bg-gray-200 hidden sm:block" />
          <h1 className="text-sm sm:text-lg font-semibold text-gray-900 truncate">
            {video.filename}
          </h1>
        </div>

        {/* Action buttons - scrollable on mobile */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {/* Share Links */}
          <div className="relative flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenSharePanel}
              className="text-xs gap-1 h-9 min-w-[40px]"
            >
              <Link2 className="h-4 w-4" />
              <span className="hidden sm:inline">Share</span>
            </Button>

            {showShareLinks && (
              <>
                <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={() => setShowShareLinks(false)} />
                <div className="fixed inset-x-3 bottom-3 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 w-auto sm:w-96 p-4 animate-scale-in">
                  <p className="text-sm font-semibold text-gray-900 mb-3">Share Links</p>

                  {loadingShareToken ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                      <span className="text-xs text-gray-500 ml-2">Generating secure link...</span>
                    </div>
                  ) : shareError ? (
                    <div className="text-center py-4">
                      <p className="text-xs text-red-500 mb-2">Failed to generate share link</p>
                      <Button variant="outline" size="sm" onClick={() => { setShareToken(null); handleOpenSharePanel(); }} className="text-xs">
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Video Link */}
                      <div className="bg-gray-50 rounded-lg p-3 mb-2">
                        <div className="flex items-center gap-2 mb-2">
                          <Link2 className="h-4 w-4 text-blue-600" />
                          <span className="text-xs font-medium text-gray-700">Video Link</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            readOnly
                            value={getVideoShareUrl()}
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                            className="flex-1 text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-600 font-mono cursor-text select-all"
                          />
                          <button
                            onClick={() => handleCopyLink(getVideoShareUrl(), 'video')}
                            className="p-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-colors flex-shrink-0"
                            title="Copy video link"
                          >
                            {copiedLink === 'video' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1.5">Client can watch the video directly</p>
                      </div>

                      {/* Review Link */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <MessageSquare className="h-4 w-4 text-emerald-600" />
                          <span className="text-xs font-medium text-gray-700">Review Link</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            readOnly
                            value={getReviewShareUrl()}
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                            className="flex-1 text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-600 font-mono cursor-text select-all"
                          />
                          <button
                            onClick={() => handleCopyLink(getReviewShareUrl(), 'review')}
                            className="p-2.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 transition-colors flex-shrink-0"
                            title="Copy review link"
                          >
                            {copiedLink === 'review' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1.5">Client can review and give feedback</p>
                      </div>

                      <p className="text-[10px] text-gray-400 mt-3 text-center">Only people with this link can access</p>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Download */}
          <Button variant="outline" size="sm" onClick={handleDownload} className="text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50 flex-shrink-0">
            <Download className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Download</span>
          </Button>

          {/* Delete */}
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-red-600 border-red-200 hover:bg-red-50 flex-shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* New Version */}
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUploadModal(true)}
              className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50 flex-shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">New Version</span>
            </Button>
          )}

          {/* Viewers */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowViewers(!showViewers)}
              className="flex items-center gap-1.5 h-9 px-2.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors active:bg-gray-200"
            >
              <Eye className="h-4 w-4" />
              <span className="font-medium">{viewers.length}</span>
            </button>
            {showViewers && (
              <>
                <div className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent" onClick={() => setShowViewers(false)} />
                <div className="fixed inset-x-3 bottom-3 sm:absolute sm:inset-auto sm:right-0 sm:top-10 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 w-auto sm:w-72 max-h-[50vh] overflow-y-auto animate-scale-in">
                  <div className="px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider border-b border-gray-100 sticky top-0 bg-white">
                    Viewed by ({viewers.length})
                  </div>
                  {viewers.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-gray-400">No one has viewed yet</div>
                  ) : (
                    viewers.map((viewer) => (
                      <div key={viewer.user_id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                        {viewer.avatar_url ? (
                          <img src={getApiUrl(viewer.avatar_url)} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {viewer.name?.charAt(0).toUpperCase() || '?'}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{viewer.name}</p>
                          <p className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(viewer.viewed_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Status */}
          {canChangeStatus ? (
            <Select
              value={video.status}
              onValueChange={handleStatusChangeRequest}
              disabled={updating}
            >
              <SelectTrigger className={`w-[120px] sm:w-[160px] h-8 text-xs font-medium border ${statusColors[video.status]} flex-shrink-0`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${statusColors[status]}`}>
                      {status}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className={`inline-flex items-center px-2 sm:px-2.5 py-1 rounded-md text-xs font-medium border ${statusColors[video.status]} flex-shrink-0`}>
              {video.status}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Main Content Area - Left (8/12) */}
        <div className="lg:col-span-8 space-y-4 sm:space-y-6">
          {/* Video Player Section */}
          <div className="relative bg-gray-950 rounded-xl overflow-hidden shadow-2xl animate-fade-in-up">
            {/* Upload Time Capsule Badge */}
            <div className="absolute top-2 sm:top-3 right-2 sm:right-3 z-10 flex items-center gap-1.5 sm:gap-2">
              {isNew && (
                <span className="flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[9px] sm:text-[10px] font-bold rounded-full shadow-lg animate-pulse">
                  <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  NEW
                </span>
              )}
              <span className="flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 bg-black/70 backdrop-blur-sm text-white text-[9px] sm:text-[10px] font-medium rounded-full shadow-lg">
                <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-blue-400" />
                {formatDistanceToNow(new Date(video.uploaded_at || video.created_at), { addSuffix: true })}
              </span>
            </div>

            {(video.media_type || 'video') === 'photo' ? (
              <div className="w-full flex items-center justify-center bg-gray-950 p-4" style={{ minHeight: '300px' }}>
                <img
                  src={videoService.getPhotoUrl(video.id)}
                  alt={video.filename}
                  className="max-w-full max-h-[70vh] object-contain rounded"
                  style={{ imageRendering: 'auto' }}
                />
              </div>
            ) : video.hls_ready ? (
              <HLSPlayer
                hlsUrl={hlsUrl}
                fallbackUrl={streamUrl}
                downloadUrl={downloadUrl}
                onProgress={handleProgress}
                onPlayerRef={(ref) => setHlsPlayerControls(ref)}
                onPlayingChange={setIsVideoPlaying}
              />
            ) : (
              <div className="w-full aspect-video bg-gray-950 rounded-lg flex items-center justify-center">
                <div className="text-center px-6 w-full max-w-sm">
                  {/* Processing Status */}
                  {processingStatus?.processing_status === 'failed' ? (
                    <>
                      <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <p className="text-red-400 text-sm font-medium mb-1">Processing Failed</p>
                      <p className="text-gray-500 text-xs">
                        {processingStatus.processing_step && processingStatus.processing_step.startsWith('error:')
                          ? processingStatus.processing_step.replace('error: ', '')
                          : 'An error occurred while transcoding this video.'}
                      </p>
                    </>
                  ) : processingStatus?.processing_status === 'queued' ? (
                    <>
                      <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-amber-300 text-sm font-medium mb-1">In Queue</p>
                      <p className="text-gray-400 text-xs mb-3">
                        Position {processingStatus.queue_position} of {processingStatus.queue_total} in processing queue
                      </p>
                      <div className="flex items-center justify-center gap-1.5">
                        {Array.from({ length: Math.min(processingStatus.queue_total, 5) }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-2 h-2 rounded-full ${
                              i < processingStatus!.queue_position
                                ? 'bg-gray-600'
                                : i === processingStatus!.queue_position
                                ? 'bg-amber-400 animate-pulse'
                                : 'bg-gray-700'
                            }`}
                          />
                        ))}
                        {processingStatus.queue_total > 5 && (
                          <span className="text-[10px] text-gray-500 ml-1">+{processingStatus.queue_total - 5}</span>
                        )}
                      </div>
                    </>
                  ) : processingStatus?.processing_status === 'processing' ? (
                    <>
                      <div className="w-12 h-12 border-3 border-gray-700 border-t-blue-400 rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-blue-300 text-sm font-medium mb-1">
                        {formatProcessingStep(processingStatus.processing_step)}
                      </p>
                      <p className="text-gray-500 text-xs mb-3">
                        {processingStatus.processing_progress}% complete
                      </p>
                      {/* Progress bar */}
                      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500"
                          style={{ width: `${processingStatus.processing_progress}%` }}
                        />
                      </div>
                      <p className="text-gray-600 text-[10px] mt-2">
                        This runs in the background — you can close this page
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 border-3 border-gray-600 border-t-blue-400 rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-gray-300 text-sm font-medium mb-1">Processing Video</p>
                      <p className="text-gray-500 text-xs">
                        Your video is being transcoded into multiple quality levels.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Video Metadata Panel */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm animate-fade-in-up" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate mb-1">
                  {video.filename}
                </h1>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-gray-500">
                  <span>{formatBytes(video.size)}</span>
                  <span className="w-1 h-1 rounded-full bg-gray-300" />
                  <span>{formatDate(video.created_at)}</span>
                  {video.uploaded_by_name && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-gray-300" />
                      <span>by {video.uploaded_by_name}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleDownload} className="text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-[9px] sm:text-[10px] text-gray-300 font-mono uppercase tracking-wider truncate">
                ID: {video.id}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - Right (4/12) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col lg:sticky lg:top-20 h-[calc(100vh-140px)] lg:h-[calc(100vh-100px)] animate-slide-in-right overflow-hidden">
            {/* Tabs Header - prominent & recognizable */}
            <div className="flex border-b border-gray-200 bg-gray-50/50 rounded-t-xl overflow-x-auto scrollbar-hide">
              <button
                onClick={() => handleTabSwitch('feedback')}
                className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 px-2 py-3 text-xs font-bold transition-all relative ${
                  sidebarTab === 'feedback'
                    ? 'text-gray-900 bg-white border-b-2 border-blue-600 rounded-tl-xl'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100/50'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                FEEDBACK
              </button>
              <button
                onClick={() => handleTabSwitch('chat')}
                className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 px-2 py-3 text-xs font-bold transition-all relative ${
                  sidebarTab === 'chat'
                    ? 'text-gray-900 bg-white border-b-2 border-blue-600'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100/50'
                }`}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                CHAT
              </button>
              <button
                onClick={() => handleTabSwitch('activity')}
                className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 px-2 py-3 text-xs font-bold transition-all relative ${
                  sidebarTab === 'activity'
                    ? 'text-gray-900 bg-white border-b-2 border-blue-600 rounded-tr-xl'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100/50'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                ACTIVITY
              </button>
            </div>

            {/* Feedback Tab */}
            {sidebarTab === 'feedback' && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto">
                  <div className="p-3 sm:p-4 space-y-4">
                    {/* Timestamp Panel */}
                    <div className="bg-gray-50/50 rounded-lg border border-gray-100 overflow-hidden">
                      <TimestampPanel
                        comments={timestampComments}
                        onSeekTo={handleSeekTo}
                        onMarkerStatusUpdate={handleMarkerStatusUpdate}
                        currentTime={currentTime}
                        canEditStatus={canChangeMarkerStatus}
                      />
                    </div>

                    {/* Comments Thread */}
                    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                      <CommentsSection
                        videoId={video.id}
                        comments={comments}
                        currentTime={currentTime}
                        onSeekTo={handleSeekTo}
                        onCommentAdded={handleCommentAdded}
                        onCommentDeleted={handleCommentDeleted}
                        onTypingStart={handleFeedbackTypingStart}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Chat Tab */}
            {sidebarTab === 'chat' && (
              <div className="flex-1 overflow-hidden flex flex-col">
                {workspaceId ? (
                  <WorkspaceChat workspaceId={workspaceId} className="h-full border-none shadow-none rounded-none" />
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-gray-400">Loading workspace chat...</p>
                  </div>
                )}
              </div>
            )}

            {/* Activity Tab */}
            {sidebarTab === 'activity' && (
              <ActivityLog videoId={video.id} />
            )}
          </div>
        </div>
      </div>

      {/* Status Change Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmStatus.open}
        title="Change Video Status"
        message={`Are you sure you want to change the status from "${video?.status}" to "${confirmStatus.newStatus}"?`}
        confirmText={`Change to ${confirmStatus.newStatus}`}
        onConfirm={handleStatusConfirm}
        onCancel={() => setConfirmStatus({ open: false, newStatus: null })}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDelete}
        title="Delete Video"
        message="This video will be moved to recently deleted and can be restored within 3 days. After that, it will be permanently deleted."
        confirmText="Delete"
        variant="danger"
        showPassword={isAdmin}
        error={deleteError}
        onConfirm={handleDeleteVideo}
        onCancel={() => { setConfirmDelete(false); setDeleteError(''); }}
      />
      {/* Upload New Version Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadComplete={handleUploadComplete}
        bucket={currentBucket}
        folderId={video.folder_id}
        replaceVideoId={video.id}
      />
    </div>
  );
}
