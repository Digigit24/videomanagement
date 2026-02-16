import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBucket } from '@/hooks/useBucket';
import { videoService, commentService } from '@/services/api.service';
import { Video, VideoStatus, Comment, VideoViewer } from '@/types';
import { formatBytes, formatDate } from '@/lib/utils';
import VideoPlayer from '@/components/VideoPlayer';
import CommentsSection from '@/components/CommentsSection';
import TimestampPanel from '@/components/TimestampPanel';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Eye } from 'lucide-react';
import ReactPlayer from 'react-player';
import { formatDistanceToNow } from 'date-fns';

const statusOptions: VideoStatus[] = ['Pending', 'Under Review', 'Approved', 'Changes Needed', 'Rejected'];

const statusColors: Record<VideoStatus, string> = {
  'Pending': 'bg-amber-100 text-amber-800 border-amber-200',
  'Under Review': 'bg-blue-100 text-blue-800 border-blue-200',
  'Approved': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Changes Needed': 'bg-orange-100 text-orange-800 border-orange-200',
  'Rejected': 'bg-red-100 text-red-800 border-red-200',
};

export default function VideoDetail() {
  const { id } = useParams<{ id: string }>();
  const { currentBucket } = useBucket();
  const navigate = useNavigate();
  const playerRef = useRef<ReactPlayer>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [viewers, setViewers] = useState<VideoViewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showViewers, setShowViewers] = useState(false);

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

  const handleStatusChange = async (status: VideoStatus) => {
    if (!video) return;
    const previousStatus = video.status;
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

  const handleProgress = (state: { played: number; playedSeconds: number }) => {
    setCurrentTime(state.playedSeconds);
  };

  const handleSeekTo = (time: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(time, 'seconds');
    }
  };

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
  const timestampComments = comments.filter(c => c.video_timestamp !== null);

  return (
    <div className="space-y-0">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="h-4 w-px bg-gray-200" />
          <h1 className="text-lg font-semibold text-gray-900 truncate max-w-md">
            {video.filename}
          </h1>
        </div>

        <div className="flex items-center gap-3">
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
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                        {viewer.name?.charAt(0).toUpperCase() || '?'}
                      </div>
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
          <Select
            value={video.status}
            onValueChange={handleStatusChange}
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
        </div>
      </div>

      {/* Main content: Video + Timestamp Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
        {/* Video Player - Takes 2/3 */}
        <div className="lg:col-span-2">
          <VideoPlayer
            url={streamUrl}
            filename={video.filename}
            onProgress={handleProgress}
            playerRef={playerRef}
          />

          {/* Video info bar */}
          <div className="flex items-center gap-4 px-1 py-3 text-xs text-gray-400">
            <span>{formatBytes(video.size)}</span>
            <span className="w-px h-3 bg-gray-200" />
            <span>{formatDate(video.created_at)}</span>
            {video.uploaded_by_name && (
              <>
                <span className="w-px h-3 bg-gray-200" />
                <span>by {video.uploaded_by_name}</span>
              </>
            )}
            <span className="w-px h-3 bg-gray-200" />
            <span>{video.bucket}</span>
          </div>
        </div>

        {/* Right Panel - Timestamp Markers */}
        <div className="lg:col-span-1 lg:border-l border-gray-200">
          <TimestampPanel
            comments={timestampComments}
            onSeekTo={handleSeekTo}
            onMarkerStatusUpdate={handleMarkerStatusUpdate}
            currentTime={currentTime}
          />
        </div>
      </div>

      {/* Comments Thread */}
      <div className="border-t border-gray-200 pt-4 mt-2">
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
  );
}
