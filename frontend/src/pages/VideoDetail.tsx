import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBucket } from '@/hooks/useBucket';
import { videoService, commentService, workspaceService } from '@/services/api.service';
import { Video, VideoStatus, Comment, VideoViewer } from '@/types';
import { formatBytes, formatDate, getApiUrl } from '@/lib/utils';
import VideoPlayer from '@/components/VideoPlayer';
import HLSPlayer from '@/components/HLSPlayer';
import CommentsSection from '@/components/CommentsSection';
import TimestampPanel from '@/components/TimestampPanel';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Eye, Download, Trash2, Clock, Sparkles, Link2, Copy, Check, MessageSquare } from 'lucide-react';
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

function isRecentUpload(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const uploadTime = new Date(dateStr).getTime();
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return (now - uploadTime) < twentyFourHours;
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
  const [hlsPlayerControls, setHlsPlayerControls] = useState<{ seekTo: (time: number) => void } | null>(null);
  const [showShareLinks, setShowShareLinks] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [loadingShareToken, setLoadingShareToken] = useState(false);

  const [confirmStatus, setConfirmStatus] = useState<{ open: boolean; newStatus: VideoStatus | null }>({
    open: false,
    newStatus: null,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

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

  const handleDeleteVideo = async (password?: string) => {
    if (!id || !currentBucket) return;
    try {
      await videoService.deleteVideo(id, currentBucket, password);
      navigate(`/workspace/${currentBucket}`);
    } catch (error) {
      console.error("Failed to delete video:", error);
    }
  };

  const handleDownload = () => {
    if (!video || !currentBucket) return;
    const url = videoService.getDownloadUrl(video.id, currentBucket);
    window.open(url, '_blank');
  };

  const getVideoShareUrl = () => {
    if (!video || !shareToken) return '';
    return `${window.location.origin}/v/${video.id}?token=${shareToken}`;
  };

  const getReviewShareUrl = () => {
    if (!video || !shareToken) return '';
    return `${window.location.origin}/v/${video.id}/review?token=${shareToken}`;
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
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        setCopiedLink(type);
        setTimeout(() => setCopiedLink(null), 2500);
        return;
      }
    } catch (e) {
      // Clipboard API failed, try fallback
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
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700 flex-shrink-0">
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
                <div className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent" onClick={() => setShowShareLinks(false)} />
                <div className="fixed inset-x-3 bottom-3 sm:absolute sm:inset-auto sm:right-0 sm:top-10 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 w-auto sm:w-96 p-4 animate-scale-in">
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

            {video.hls_ready ? (
              <HLSPlayer
                hlsUrl={hlsUrl}
                fallbackUrl={streamUrl}
                downloadUrl={downloadUrl}
                onProgress={handleProgress}
                onPlayerRef={(ref) => setHlsPlayerControls(ref)}
              />
            ) : (
              <VideoPlayer
                url={streamUrl}
                downloadUrl={downloadUrl}
                onProgress={handleProgress}
                playerRef={playerRef}
              />
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
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                    className="text-gray-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
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
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col lg:sticky lg:top-20 max-h-[70vh] lg:max-h-[calc(100vh-100px)] animate-slide-in-right">
            {/* Tabs Header */}
            <div className="flex border-b border-gray-100">
              <button className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-gray-900 border-b-2 border-gray-900">
                Markers & Comments
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 sm:space-y-6">
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

              {/* Chat Thread */}
              <div className="border-t border-gray-100 pt-4 sm:pt-6">
                <CommentsSection
                  videoId={video.id}
                  workspaceId={workspaceId}
                  comments={comments}
                  currentTime={currentTime}
                  onSeekTo={handleSeekTo}
                  onCommentAdded={handleCommentAdded}
                  onCommentDeleted={handleCommentDeleted}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Change Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmStatus.open}
        title="Change Video Status"
        message={`Are you sure you want to change the status from "${video.status}" to "${confirmStatus.newStatus}"?`}
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
        onConfirm={handleDeleteVideo}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
