import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBucket } from '@/hooks/useBucket';
import { videoService, commentService } from '@/services/api.service';
import { Video, VideoStatus, Comment, VideoViewer } from '@/types';
import { formatBytes, formatDate, getApiUrl } from '@/lib/utils';
import VideoPlayer from '@/components/VideoPlayer';
import HLSPlayer from '@/components/HLSPlayer';
import CommentsSection from '@/components/CommentsSection';
import TimestampPanel from '@/components/TimestampPanel';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Eye, Download, Upload, Trash2, Clock, Sparkles } from 'lucide-react';
import ReactPlayer from 'react-player';
import { formatDistanceToNow } from 'date-fns';

const statusOptions: VideoStatus[] = ['Draft', 'Pending', 'Under Review', 'Approved', 'Changes Needed', 'Rejected'];

const statusColors: Record<VideoStatus, string> = {
  'Draft': 'bg-slate-100 text-slate-700 border-slate-200',
  'Pending': 'bg-amber-100 text-amber-800 border-amber-200',
  'Under Review': 'bg-blue-100 text-blue-800 border-blue-200',
  'Approved': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Changes Needed': 'bg-orange-100 text-orange-800 border-orange-200',
  'Rejected': 'bg-red-100 text-red-800 border-red-200',
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
  const uploadRef = useRef<HTMLInputElement>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [viewers, setViewers] = useState<VideoViewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [hlsPlayerControls, setHlsPlayerControls] = useState<{ seekTo: (time: number) => void } | null>(null);
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Confirmation dialog state
  const [confirmStatus, setConfirmStatus] = useState<{ open: boolean; newStatus: VideoStatus | null }>({
    open: false,
    newStatus: null,
  });

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false);

  const userRole = localStorage.getItem('userRole');
  const isAdmin = userRole === 'admin';
  const isVideoEditor = userRole === 'video_editor';
  const isClient = userRole === 'client';

  const canChangeStatus = isClient || isAdmin;
  const canChangeMarkerStatus = isVideoEditor || isAdmin;

  const canUpload = [
    'admin',
    'video_editor',
    'project_manager',
    'social_media_manager',
    'client'
  ].includes(userRole || '');

  const canDelete = ['admin', 'video_editor', 'project_manager'].includes(userRole || '');

  useEffect(() => {
    if (id && currentBucket) {
      loadVideo();
      loadComments();
      loadViewers();
      videoService.recordView(id).catch(() => {});
    }
  }, [id, currentBucket]);

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

  // Replace video (instead of versioning)
  const handleReplaceVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !video || !currentBucket) return;

    setUploadingVersion(true);
    setUploadProgress(0);

    try {
      const newVideo = await videoService.uploadVideo(
        file,
        currentBucket,
        (progress) => {
          if (progress.total) {
            setUploadProgress(Math.round((progress.loaded / progress.total) * 100));
          }
        },
        video.id // replaceVideoId
      );

      // Navigate to the new video
      navigate(`/workspace/${currentBucket}/video/${newVideo.id}`);
    } catch (error) {
      console.error('Failed to replace video:', error);
    } finally {
      setUploadingVersion(false);
      setUploadProgress(0);
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  // Delete video
  const handleDeleteVideo = async (password?: string) => {
    if (!id || !currentBucket) return;
    try {
      await videoService.deleteVideo(id, currentBucket, password);
      navigate(`/workspace/${currentBucket}`);
    } catch (error) {
      console.error("Failed to delete video:", error);
    }
  };

  // Download
  const handleDownload = () => {
    if (!video || !currentBucket) return;
    const url = videoService.getDownloadUrl(video.id, currentBucket);
    window.open(url, '_blank');
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
    <div className="space-y-0">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="h-4 w-px bg-gray-200" />
          <h1 className="text-lg font-semibold text-gray-900 truncate max-w-md">
            {video.filename}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Replace Video */}
          {canUpload && (
            <>
              <input
                ref={uploadRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                onChange={handleReplaceVideo}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => uploadRef.current?.click()}
                disabled={uploadingVersion}
                className="text-xs"
              >
                {uploadingVersion ? (
                  <span className="flex items-center gap-1.5">
                    <div className="w-3 h-3 border-2 border-gray-400 border-t-gray-700 rounded-full animate-spin" />
                    {uploadProgress}%
                  </span>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5 mr-1" />
                    Upload New Version
                  </>
                )}
              </Button>
            </>
          )}

          {/* Download */}
          <Button variant="outline" size="sm" onClick={handleDownload} className="text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50">
            <Download className="h-3.5 w-3.5 mr-1" />
            Download
          </Button>

          {/* Delete */}
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Viewers */}
          <div className="relative">
            <button
              onClick={() => setShowViewers(!showViewers)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <Eye className="h-4 w-4" />
              <span>{viewers.length} viewed</span>
            </button>
            {showViewers && viewers.length > 0 && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowViewers(false)} />
                <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-40 w-64 py-2 max-h-60 overflow-y-auto">
                  <div className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Viewed by
                  </div>
                  {viewers.map((viewer) => (
                    <div key={viewer.user_id} className="px-3 py-2 flex items-center gap-2.5 hover:bg-gray-50">
                      {viewer.avatar_url ? (
                        <img src={getApiUrl(viewer.avatar_url)} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                          {viewer.name?.charAt(0).toUpperCase() || '?'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{viewer.name}</p>
                        <p className="text-xs text-gray-400">
                          {formatDistanceToNow(new Date(viewer.viewed_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
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
              <SelectTrigger className={`w-[160px] h-8 text-xs font-medium border ${statusColors[video.status]}`}>
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
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${statusColors[video.status]}`}>
              {video.status}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Content Area - Left (8/12) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Video Player Section with Time Capsule */}
          <div className="relative bg-gray-950 rounded-xl overflow-hidden shadow-2xl">
            {/* Upload Time Capsule Badge - Top Right */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
              {isNew && (
                <span className="flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[10px] font-bold rounded-full shadow-lg animate-pulse">
                  <Sparkles className="h-3 w-3" />
                  NEW
                </span>
              )}
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-black/70 backdrop-blur-sm text-white text-[10px] font-medium rounded-full shadow-lg">
                <Clock className="h-3 w-3 text-blue-400" />
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
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-gray-900 truncate mb-1">
                  {video.filename}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
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

            <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg border border-gray-100 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</span>
                {canChangeStatus ? (
                  <Select
                    value={video.status}
                    onValueChange={handleStatusChangeRequest}
                    disabled={updating}
                  >
                    <SelectTrigger className={`w-[160px] h-8 text-xs font-medium border ${statusColors[video.status]}`}>
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
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${statusColors[video.status]}`}>
                    {video.status}
                  </span>
                )}
              </div>

              {/* Replace Video Trigger */}
              {canUpload && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => uploadRef.current?.click()}
                  disabled={uploadingVersion}
                  className="text-xs h-8"
                >
                  {uploadingVersion ? (
                    <span className="flex items-center gap-1.5">
                      <div className="w-3 h-3 border-2 border-gray-400 border-t-gray-700 rounded-full animate-spin" />
                      {uploadProgress}%
                    </span>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5 mr-1" />
                      Replace Video
                    </>
                  )}
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="text-[10px] text-gray-300 font-mono uppercase tracking-wider">
                ID: {video.id}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - Right (4/12) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col sticky top-6 max-h-[calc(100vh-80px)]">
            {/* Tabs Header */}
            <div className="flex border-b border-gray-100">
              <button className="flex-1 px-4 py-3 text-sm font-semibold text-gray-900 border-b-2 border-gray-900">
                Markers & Comments
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Timestamp Panel Integration */}
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
              <div className="border-t border-gray-100 pt-6">
                <CommentsSection
                  videoId={video.id}
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
