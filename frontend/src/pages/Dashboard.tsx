import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { workspaceService, videoService } from '@/services/api.service';
import { useBucket } from '@/hooks/useBucket';
import { Workspace, Video } from '@/types';
import VideoTable from '@/components/VideoTable';
import CreateWorkspaceModal from '@/components/CreateWorkspaceModal';
import { FolderOpen, FileVideo, Users, CalendarDays, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const role = localStorage.getItem('userRole');
  const isOrgRole = ['admin', 'editor', 'project_manager', 'social_media_manager'].includes(role || '');

  if (isOrgRole) {
    return <AdminDashboard />;
  }

  return <ClientDashboard />;
}

function AdminDashboard() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const navigate = useNavigate();
  const userRole = localStorage.getItem('userRole');
  const canCreate = userRole === 'admin' || userRole === 'project_manager';

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      const data = await workspaceService.getWorkspaces();
      setWorkspaces(data);
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading workspaces...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Client Workspaces</h1>
        {canCreate && (
          <Button onClick={() => setCreateModalOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New Client
          </Button>
        )}
      </div>

      {workspaces.length === 0 ? (
        <div className="text-center py-20">
          <FolderOpen className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400">No workspaces yet</p>
          <p className="text-xs text-gray-300 mt-1">Create a workspace to get started</p>
          {canCreate && (
            <Button onClick={() => setCreateModalOpen(true)} size="sm" className="mt-4">
              <Plus className="h-4 w-4 mr-1" />
              Create Workspace
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {workspaces.map((workspace) => (
            <div
              key={workspace.id}
              onClick={() => {
                localStorage.setItem('currentBucket', workspace.bucket);
                navigate(`/workspace/${workspace.bucket}`);
              }}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3 mb-4">
                {workspace.client_logo ? (
                  <img
                    src={workspace.client_logo}
                    alt={workspace.client_name}
                    className="w-12 h-12 rounded-lg object-cover border border-gray-100"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold">
                    {workspace.client_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{workspace.client_name}</h3>
                  <p className="text-xs text-gray-400">{workspace.bucket}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-400">
                <div className="flex items-center gap-1">
                  <FileVideo className="h-3 w-3" />
                  <span>{workspace.video_count || 0} videos</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>{workspace.member_count || 0} members</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateWorkspaceModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={loadWorkspaces}
      />
    </div>
  );
}

type DateFilter = 'all' | 'today' | 'custom';

function ClientDashboard() {
  const { currentBucket } = useBucket();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customDate, setCustomDate] = useState('');

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
    } catch (error) {
      console.error('Failed to load videos:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredVideos = videos.filter((video) => {
    if (dateFilter === 'all') return true;

    const videoDate = new Date(video.created_at);
    const today = new Date();

    if (dateFilter === 'today') {
      return (
        videoDate.getFullYear() === today.getFullYear() &&
        videoDate.getMonth() === today.getMonth() &&
        videoDate.getDate() === today.getDate()
      );
    }

    if (dateFilter === 'custom' && customDate) {
      const filterDate = new Date(customDate);
      return (
        videoDate.getFullYear() === filterDate.getFullYear() &&
        videoDate.getMonth() === filterDate.getMonth() &&
        videoDate.getDate() === filterDate.getDate()
      );
    }

    return true;
  });

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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Your Videos</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDateFilter('today')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              dateFilter === 'today'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <CalendarDays className="h-3 w-3 inline mr-1" />
            Today
          </button>

          <input
            type="date"
            value={customDate}
            onChange={(e) => {
              setCustomDate(e.target.value);
              setDateFilter('custom');
            }}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-300"
          />

          {dateFilter !== 'all' && (
            <button
              onClick={() => {
                setDateFilter('all');
                setCustomDate('');
              }}
              className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              title="Remove filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <VideoTable videos={filteredVideos} />
    </div>
  );
}
