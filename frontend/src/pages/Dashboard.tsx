import { useState, useEffect } from 'react';
import { useBucket } from '@/hooks/useBucket';
import { videoService } from '@/services/api.service';
import { Video, VideoStatus, DashboardStats } from '@/types';
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
    pending: 0,
    underReview: 0,
    approved: 0,
    changesNeeded: 0,
    rejected: 0,
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
    setVideos(prevVideos =>
      prevVideos.map(video =>
        video.id === videoId
          ? { ...video, status: newStatus, updated_at: new Date().toISOString() }
          : video
      )
    );

    const updatedVideos = videos.map(video =>
      video.id === videoId ? { ...video, status: newStatus } : video
    );
    calculateStats(updatedVideos);
  };

  const calculateStats = (videos: Video[]) => {
    setStats({
      total: videos.length,
      pending: videos.filter((v) => v.status === 'Pending').length,
      underReview: videos.filter((v) => v.status === 'Under Review').length,
      approved: videos.filter((v) => v.status === 'Approved').length,
      changesNeeded: videos.filter((v) => v.status === 'Changes Needed').length,
      rejected: videos.filter((v) => v.status === 'Rejected').length,
    });
  };

  if (!currentBucket) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading videos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardCards stats={stats} />

      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">Videos</h2>
        <div className="flex items-center gap-3">
          <Button onClick={() => setUploadModalOpen(true)} size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Upload
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
