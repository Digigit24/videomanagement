import { useState, useEffect } from 'react';
import { useBucket } from '@/hooks/useBucket';
import { videoService } from '@/services/api.service';
import { Video, DashboardStats } from '@/types';
import DashboardCards from '@/components/DashboardCards';
import VideoTable from '@/components/VideoTable';
import KanbanBoard from '@/components/KanbanBoard';
import ViewSwitcher from '@/components/ViewSwitcher';
import UploadModal from '@/components/UploadModal';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

export default function Dashboard() {
  const { currentBucket } = useBucket();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [view, setView] = useState<'list' | 'kanban'>(() => {
    return (localStorage.getItem('viewMode') as 'list' | 'kanban') || 'list';
  });
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    draft: 0,
    inReview: 0,
    published: 0,
    archived: 0,
  });

  const handleViewChange = (newView: 'list' | 'kanban') => {
    setView(newView);
    localStorage.setItem('viewMode', newView);
  };

  useEffect(() => {
    if (currentBucket) {
      loadVideos();
    }
  }, [currentBucket]);

  const loadVideos = async () => {
    if (!currentBucket) return;

    setLoading(true);
    try {
      const data = await videoService.getVideos(currentBucket);
      setVideos(data);
      calculateStats(data);
    } catch (error) {
      console.error('Failed to load videos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOptimisticUpdate = (videoId: string, newStatus: VideoStatus) => {
    // Optimistically update local state
    setVideos(prevVideos =>
      prevVideos.map(video =>
        video.id === videoId
          ? { ...video, status: newStatus, updated_at: new Date().toISOString() }
          : video
      )
    );

    // Recalculate stats with new data
    const updatedVideos = videos.map(video =>
      video.id === videoId ? { ...video, status: newStatus } : video
    );
    calculateStats(updatedVideos);
  };

  const calculateStats = (videos: Video[]) => {
    setStats({
      total: videos.length,
      draft: videos.filter((v) => v.status === 'Draft').length,
      inReview: videos.filter((v) => v.status === 'In Review').length,
      published: videos.filter((v) => v.status === 'Published').length,
      archived: videos.filter((v) => v.status === 'Archived').length,
    });
  };

  if (!currentBucket) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading bucket...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading videos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardCards stats={stats} />

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Videos</h2>
        <div className="flex items-center gap-3">
          <Button onClick={() => setUploadModalOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Video
          </Button>
          <ViewSwitcher view={view} onViewChange={handleViewChange} />
        </div>
      </div>

      {view === 'list' ? (
        <VideoTable videos={videos} />
      ) : (
        <KanbanBoard videos={videos} onVideoUpdate={handleOptimisticUpdate} />
      )}

      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadComplete={loadVideos}
      />
    </div>
  );
}
