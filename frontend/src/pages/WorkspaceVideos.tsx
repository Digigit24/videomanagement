import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { videoService, workspaceService } from '@/services/api.service';
import { Video, VideoStatus, DashboardStats, Workspace } from '@/types';
import DashboardCards from '@/components/DashboardCards';
import VideoTable from '@/components/VideoTable';
import KanbanBoard from '@/components/KanbanBoard';
import ViewSwitcher from '@/components/ViewSwitcher';
import UploadModal from '@/components/UploadModal';
import WorkspaceChat from '@/components/WorkspaceChat';
import ManageMembersModal from '@/components/ManageMembersModal';
import { Button } from '@/components/ui/button';
import { Upload, ArrowLeft, Filter, MessageCircle, X, Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isToday, isThisWeek, isThisMonth, parseISO } from 'date-fns';

export default function WorkspaceVideos() {
  const { bucket } = useParams<{ bucket: string }>();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<Video[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [showChat, setShowChat] = useState(false);
  const [showManageMembers, setShowManageMembers] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [view, setView] = useState<'list' | 'kanban'>(() => {
    return (localStorage.getItem('viewMode') as 'list' | 'kanban') || 'list';
  });
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    draft: 0,
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
    if (bucket) {
      localStorage.setItem('currentBucket', bucket);
      loadVideos();
      loadWorkspaceInfo();
    }
  }, [bucket]);

  useEffect(() => {
    filterVideos();
  }, [videos, dateFilter]);

  const loadVideos = async () => {
    if (!bucket) return;
    setLoading(true);
    try {
      const data = await videoService.getVideos(bucket);
      setVideos(data);
      calculateStats(data);
    } catch (error) {
      console.error('Failed to load videos:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWorkspaceInfo = async () => {
    try {
      const workspaces = await workspaceService.getWorkspaces();
      const ws = workspaces.find(w => w.bucket === bucket);
      if (ws) setWorkspace(ws);
    } catch (error) {
      console.error('Failed to load workspace info:', error);
    }
  };

  const filterVideos = () => {
    if (dateFilter === 'all') {
      setFilteredVideos(videos);
      return;
    }

    const filtered = videos.filter(video => {
      const date = parseISO(video.created_at);
      if (dateFilter === 'today') return isToday(date);
      if (dateFilter === 'week') return isThisWeek(date);
      if (dateFilter === 'month') return isThisMonth(date);
      return true;
    });
    setFilteredVideos(filtered);
  };

  const handleOptimisticUpdate = (videoId: string, newStatus: VideoStatus) => {
    setVideos(prevVideos =>
      prevVideos.map(video =>
        video.id === videoId
          ? { ...video, status: newStatus, updated_at: new Date().toISOString() }
          : video
      )
    );
  };

  const calculateStats = (videos: Video[]) => {
    setStats({
      total: videos.length,
      draft: videos.filter((v) => v.status === 'Draft').length,
      pending: videos.filter((v) => v.status === 'Pending').length,
      underReview: videos.filter((v) => v.status === 'Under Review').length,
      approved: videos.filter((v) => v.status === 'Approved').length,
      changesNeeded: videos.filter((v) => v.status === 'Changes Needed').length,
      rejected: videos.filter((v) => v.status === 'Rejected').length,
    });
  };

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="h-4 w-px bg-gray-200" />
          <h1 className="text-lg font-semibold text-gray-900">{workspace?.client_name || bucket}</h1>
        </div>

        <div className="flex items-center gap-3">
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs border-dashed bg-white">
              <Filter className="w-3.5 h-3.5 mr-2 text-gray-500" />
              <SelectValue placeholder="Filter Date" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>

          <ViewSwitcher view={view} onViewChange={handleViewChange} />

          {/* Manage Members */}
          {workspace && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowManageMembers(true)}
              className="gap-1.5"
            >
              <Users className="h-4 w-4" />
              Members
            </Button>
          )}

          {/* Chat Toggle */}
          {workspace && (
            <Button
              variant={showChat ? "default" : "outline"}
              size="sm"
              onClick={() => setShowChat(!showChat)}
              className="gap-1.5"
            >
              {showChat ? (
                <>
                  <X className="h-4 w-4" />
                  Close Chat
                </>
              ) : (
                <>
                  <MessageCircle className="h-4 w-4" />
                  Chat
                </>
              )}
            </Button>
          )}

          <Button onClick={() => setUploadModalOpen(true)} size="sm" className="gap-2">
            <Upload className="h-4 w-4" />
            Upload
          </Button>
        </div>
      </div>

      <DashboardCards stats={stats} />

      <div className={`grid ${showChat ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'} gap-4`}>
        {/* Videos */}
        <div className={showChat ? 'lg:col-span-6' : ''}>
          {filteredVideos.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
              <div className="mx-auto w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                <Filter className="h-6 w-6 text-gray-300" />
              </div>
              <h3 className="text-sm font-medium text-gray-900">No videos found</h3>
              <p className="text-xs text-gray-500 mt-1">
                {videos.length === 0 ? 'Upload a video to get started' : 'Try adjusting your filters'}
              </p>
              {videos.length === 0 && (
                <Button variant="outline" size="sm" onClick={() => setUploadModalOpen(true)} className="mt-4">
                  Upload Video
                </Button>
              )}
            </div>
          ) : view === 'list' ? (
            <VideoTable videos={filteredVideos} />
          ) : (
            <KanbanBoard videos={filteredVideos} onVideoUpdate={handleOptimisticUpdate} />
          )}
        </div>

        {/* Chat Panel */}
        {showChat && workspace && (
          <div className="lg:col-span-6">
            <WorkspaceChat workspaceId={workspace.id} />
          </div>
        )}
      </div>

      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadComplete={loadVideos}
        bucket={bucket}
      />

      {showManageMembers && workspace && (
        <ManageMembersModal
          workspaceId={workspace.id}
          onClose={() => {
            setShowManageMembers(false);
            loadWorkspaceInfo(); // Refresh member count in header if needed
          }}
        />
      )}
    </div>
  );
}
