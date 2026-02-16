import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBucket } from '@/hooks/useBucket';
import { videoService } from '@/services/api.service';
import { Video, VideoStatus } from '@/types';
import { formatBytes, formatDate } from '@/lib/utils';
import VideoPlayer from '@/components/VideoPlayer';
import CommentsSection from '@/components/CommentsSection';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import ReactPlayer from 'react-player';

const statusOptions: VideoStatus[] = ['Draft', 'In Review', 'Approved', 'Published', 'Archived'];

export default function VideoDetail() {
  const { id } = useParams<{ id: string }>();
  const { currentBucket } = useBucket();
  const navigate = useNavigate();
  const playerRef = useRef<ReactPlayer>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (id && currentBucket) {
      loadVideo();
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

  const handleStatusChange = async (status: VideoStatus) => {
    if (!video) return;

    const previousStatus = video.status;

    // Optimistic update
    setVideo({ ...video, status, updated_at: new Date().toISOString() });
    setUpdating(true);

    try {
      await videoService.updateStatus(video.id, status);
    } catch (error) {
      console.error('Failed to update status:', error);
      // Revert on error
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

  if (loading || !video || !currentBucket) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading video...</p>
      </div>
    );
  }

  const streamUrl = videoService.getStreamUrl(video.id, currentBucket);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <VideoPlayer
            url={streamUrl}
            filename={video.filename}
            onProgress={handleProgress}
            playerRef={playerRef}
          />

          {/* Comments Section */}
          <Card>
            <CardContent className="pt-6">
              <CommentsSection
                videoId={video.id}
                currentTime={currentTime}
                onSeekTo={handleSeekTo}
              />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Video Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Filename</label>
                <p className="text-sm text-gray-900 mt-1">{video.filename}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Size</label>
                <p className="text-sm text-gray-900 mt-1">{formatBytes(video.size)}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Bucket</label>
                <p className="text-sm text-gray-900 mt-1">{video.bucket}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Upload Date</label>
                <p className="text-sm text-gray-900 mt-1">{formatDate(video.created_at)}</p>
              </div>

              {video.uploaded_by_name && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Uploaded By</label>
                  <p className="text-sm text-gray-900 mt-1">{video.uploaded_by_name}</p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Status</label>
                <Select
                  value={video.status}
                  onValueChange={handleStatusChange}
                  disabled={updating}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {updating && (
                <p className="text-xs text-gray-500">Updating status...</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
