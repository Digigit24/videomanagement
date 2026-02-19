import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { videoService, workspaceService, folderService } from '@/services/api.service';
import { Video, VideoStatus, DashboardStats, Workspace, WorkspaceAnalytics, Folder } from '@/types';
import DashboardCards from '@/components/DashboardCards';
import VideoTable from '@/components/VideoTable';
import KanbanBoard from '@/components/KanbanBoard';
import ViewSwitcher from '@/components/ViewSwitcher';
import UploadModal from '@/components/UploadModal';
import WorkspaceChat from '@/components/WorkspaceChat';
import ManageMembersModal from '@/components/ManageMembersModal';
import { Button } from '@/components/ui/button';
import { Upload, ArrowLeft, Filter, MessageCircle, X, Users, BarChart3, Send, TrendingUp, Calendar as CalendarIcon, FileVideo as FileVideoIcon, FolderPlus, FolderOpen, Image, Trash2, ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { isToday, isThisWeek, isThisMonth, parseISO, format } from 'date-fns';

export default function WorkspaceVideos() {
  const { bucket } = useParams<{ bucket: string }>();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<Video[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'folders' | 'chat' | 'analytics'>('folders');
  const [showManageMembers, setShowManageMembers] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [analytics, setAnalytics] = useState<WorkspaceAnalytics | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string>('all');
  const userRole = localStorage.getItem('userRole') || 'member';
  const canCreateFolder = ['admin', 'project_manager', 'social_media_manager', 'video_editor', 'videographer', 'photo_editor'].includes(userRole);
  const canDeleteFolder = ['admin', 'project_manager', 'social_media_manager'].includes(userRole);
  const [view, setView] = useState<'list' | 'kanban'>(() => {
    return (localStorage.getItem('viewMode') as 'list' | 'kanban') || 'list';
  });
  const [stats, setStats] = useState<DashboardStats>({
    total: 0, draft: 0, pending: 0, underReview: 0,
    approved: 0, changesNeeded: 0, rejected: 0, posted: 0,
  });

  const pollHashRef = useRef<{ count: number; lastUpdated: string | null; lastCreated: string | null } | null>(null);

  const handleViewChange = (newView: 'list' | 'kanban') => {
    setView(newView);
    localStorage.setItem('viewMode', newView);
  };

  useEffect(() => {
    if (bucket) {
      localStorage.setItem('currentBucket', bucket);
      loadVideos();
      loadWorkspaceInfo();
      loadAnalytics();
      loadFolders();
    }
  }, [bucket]);

  useEffect(() => {
    if (!bucket) return;
    const interval = setInterval(pollVideoChanges, 4000);
    return () => clearInterval(interval);
  }, [bucket]);

  useEffect(() => {
    filterVideos();
  }, [videos, dateFilter, statusFilter, selectedFolder, mediaTypeFilter]);

  const loadVideos = async () => {
    if (!bucket) return;
    setLoading(true);
    try {
      const data = await videoService.getVideos(bucket);
      setVideos(data);
      calculateStats(data);
      try {
        const hash = await videoService.pollVideos(bucket);
        pollHashRef.current = hash;
      } catch {}
    } catch (error) {
      console.error('Failed to load videos:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshVideosSilent = useCallback(async () => {
    if (!bucket) return;
    try {
      const data = await videoService.getVideos(bucket);
      setVideos(data);
      calculateStats(data);
    } catch {}
  }, [bucket]);

  const pollVideoChanges = useCallback(async () => {
    if (!bucket) return;
    try {
      const hash = await videoService.pollVideos(bucket);
      const prev = pollHashRef.current;
      if (!prev || hash.count !== prev.count || hash.lastUpdated !== prev.lastUpdated || hash.lastCreated !== prev.lastCreated) {
        pollHashRef.current = hash;
        await refreshVideosSilent();
      }
    } catch {}
  }, [bucket, refreshVideosSilent]);

  const loadWorkspaceInfo = async () => {
    try {
      const workspaces = await workspaceService.getWorkspaces();
      const ws = workspaces.find(w => w.bucket === bucket);
      if (ws) setWorkspace(ws);
    } catch {}
  };

  const loadFolders = async () => {
    try {
      const workspaces = await workspaceService.getWorkspaces();
      const ws = workspaces.find(w => w.bucket === bucket);
      if (ws) {
        const f = await folderService.getFolders(ws.id);
        setFolders(f);
      }
    } catch {}
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !workspace?.id) return;
    try {
      await folderService.createFolder(workspace.id, newFolderName.trim());
      setNewFolderName('');
      setShowNewFolder(false);
      loadFolders();
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleDeleteFolder = async (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this folder? Media inside will be moved out of the folder.')) return;
    try {
      await folderService.deleteFolder(folderId);
      if (selectedFolder === folderId) setSelectedFolder(null);
      loadFolders();
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  const loadAnalytics = async () => {
    if (!bucket) return;
    try {
      const data = await workspaceService.getAnalytics(bucket);
      setAnalytics(data);
    } catch {}
  };

  const filterVideos = () => {
    let filtered = videos;

    if (selectedFolder) {
      filtered = filtered.filter(video => video.folder_id === selectedFolder);
    }
    if (mediaTypeFilter !== 'all') {
      filtered = filtered.filter(video => (video.media_type || 'video') === mediaTypeFilter);
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(video => video.status === statusFilter);
    }
    if (dateFilter !== 'all') {
      filtered = filtered.filter(video => {
        const date = parseISO(video.created_at);
        if (dateFilter === 'today') return isToday(date);
        if (dateFilter === 'week') return isThisWeek(date);
        if (dateFilter === 'month') return isThisMonth(date);
        return true;
      });
    }

    setFilteredVideos(filtered);
  };

  const handleOptimisticUpdate = (videoId: string, newStatus: VideoStatus) => {
    setVideos(prevVideos =>
      prevVideos.map(video =>
        video.id === videoId ? { ...video, status: newStatus, updated_at: new Date().toISOString() } : video
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
      posted: videos.filter((v) => v.status === 'Posted').length,
    });
  };

  // Compute analytics counts
  const totalVideoCount = videos.filter(v => (v.media_type || 'video') === 'video').length;
  const totalPhotoCount = videos.filter(v => (v.media_type || 'video') === 'photo').length;
  const selectedFolderObj = folders.find(f => f.id === selectedFolder);

  const activeFilters = (dateFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (mediaTypeFilter !== 'all' ? 1 : 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-700 flex-shrink-0">
          <ArrowLeft className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <div className="h-4 w-px bg-gray-200 hidden sm:block" />
        <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{workspace?.client_name || bucket}</h1>
        {selectedFolder && selectedFolderObj && (
          <>
            <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-medium text-blue-600 truncate">{selectedFolderObj.name}</span>
          </>
        )}
        <div className="flex-1" />
        {workspace && (
          <Button variant="outline" size="sm" onClick={() => setShowManageMembers(true)} className="gap-1.5 flex-shrink-0 h-8 text-xs">
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Members</span>
          </Button>
        )}
      </div>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Folders</p>
          <p className="text-xl font-bold text-gray-900">{folders.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Videos</p>
          <p className="text-xl font-bold text-gray-900">{totalVideoCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Photos</p>
          <p className="text-xl font-bold text-gray-900">{totalPhotoCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Approved</p>
          <p className="text-xl font-bold text-emerald-600">{stats.approved + stats.posted}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 hidden sm:block">
          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Pending Review</p>
          <p className="text-xl font-bold text-amber-600">{stats.pending + stats.underReview}</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 flex-shrink-0">
          <button
            onClick={() => { setActiveTab('folders'); setSelectedFolder(null); }}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'folders' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Folders
          </button>
          {workspace && (
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'chat' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Chat
            </button>
          )}
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'analytics' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Analytics
          </button>
        </div>
      </div>

      {/* FOLDERS TAB */}
      {activeTab === 'folders' && !selectedFolder && (
        <div className="animate-fade-in space-y-4">
          {/* Create Folder */}
          {canCreateFolder && (
            <div className="flex items-center gap-2">
              {showNewFolder ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    placeholder="Folder name..."
                    className="h-9 w-48 text-sm"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); } }}
                  />
                  <Button size="sm" onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="h-9 text-xs">Create</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="h-9 text-xs">Cancel</Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)} className="gap-1.5 h-9 text-xs">
                  <FolderPlus className="h-3.5 w-3.5" />
                  New Folder
                </Button>
              )}
            </div>
          )}

          {/* Folder Grid */}
          {folders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
              <FolderOpen className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <h3 className="text-sm font-medium text-gray-600">No folders yet</h3>
              <p className="text-xs text-gray-400 mt-1">Create a folder to organize your media</p>
              {canCreateFolder && (
                <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)} className="mt-4 gap-1.5">
                  <FolderPlus className="h-3.5 w-3.5" />
                  Create Folder
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {folders.map((folder, i) => {
                const folderVideos = videos.filter(v => v.folder_id === folder.id);
                const folderVideoCount = folderVideos.filter(v => (v.media_type || 'video') === 'video').length;
                const folderPhotoCount = folderVideos.filter(v => (v.media_type || 'video') === 'photo').length;
                return (
                  <div
                    key={folder.id}
                    onClick={() => setSelectedFolder(folder.id)}
                    className="group bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer animate-fade-in-up"
                    style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                        <FolderOpen className="h-5 w-5 text-blue-600" />
                      </div>
                      {canDeleteFolder && (
                        <button
                          onClick={(e) => handleDeleteFolder(folder.id, e)}
                          className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-50"
                          title="Delete folder"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900 truncate mb-1 group-hover:text-blue-600 transition-colors">
                      {folder.name}
                    </h3>
                    <div className="flex items-center gap-3 text-[10px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <FileVideoIcon className="h-3 w-3" />
                        {folderVideoCount} video{folderVideoCount !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Image className="h-3 w-3" />
                        {folderPhotoCount} photo{folderPhotoCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* INSIDE FOLDER VIEW - Media Grid */}
      {activeTab === 'folders' && selectedFolder && (
        <div className="animate-fade-in space-y-4">
          {/* Folder Toolbar */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedFolder(null)}
              className="text-xs text-gray-500 flex-shrink-0 h-8"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              All Folders
            </Button>

            <div className="h-5 w-px bg-gray-200 flex-shrink-0" />

            {/* Filters */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-8 text-xs border-dashed bg-white flex-shrink-0">
                <Filter className="w-3 h-3 mr-1 text-gray-500" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Under Review">Under Review</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Changes Needed">Changes Needed</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
                <SelectItem value="Posted">Posted</SelectItem>
              </SelectContent>
            </Select>

            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[120px] h-8 text-xs border-dashed bg-white flex-shrink-0">
                <CalendarIcon className="w-3 h-3 mr-1 text-gray-500" />
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>

            {/* Media type filter pills */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {(['all', 'video', 'photo'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setMediaTypeFilter(type)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-all ${
                    mediaTypeFilter === type
                      ? type === 'video' ? 'bg-blue-100 text-blue-700'
                        : type === 'photo' ? 'bg-pink-100 text-pink-700'
                        : 'bg-gray-200 text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {type === 'all' ? 'All' : type === 'video' ? 'Videos' : 'Photos'}
                </button>
              ))}
            </div>

            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFilter('all'); setStatusFilter('all'); setMediaTypeFilter('all'); }} className="h-8 text-xs text-gray-500 flex-shrink-0 gap-1">
                <X className="h-3 w-3" /> Clear
              </Button>
            )}

            <ViewSwitcher view={view} onViewChange={handleViewChange} />

            <div className="flex-1" />

            <Button onClick={() => setUploadModalOpen(true)} size="sm" className="gap-1.5 flex-shrink-0 h-8 text-xs">
              <Upload className="h-3.5 w-3.5" />
              Upload
            </Button>
          </div>

          {/* Status Overview for this folder */}
          <DashboardCards stats={{
            total: filteredVideos.length,
            draft: filteredVideos.filter(v => v.status === 'Draft').length,
            pending: filteredVideos.filter(v => v.status === 'Pending').length,
            underReview: filteredVideos.filter(v => v.status === 'Under Review').length,
            approved: filteredVideos.filter(v => v.status === 'Approved').length,
            changesNeeded: filteredVideos.filter(v => v.status === 'Changes Needed').length,
            rejected: filteredVideos.filter(v => v.status === 'Rejected').length,
            posted: filteredVideos.filter(v => v.status === 'Posted').length,
          }} totalEverPosted={analytics?.historical.totalEverPosted} />

          {/* Media Grid */}
          {filteredVideos.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300">
              <div className="mx-auto w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                <FileVideoIcon className="h-6 w-6 text-gray-300" />
              </div>
              <h3 className="text-sm font-medium text-gray-600">No media in this folder</h3>
              <p className="text-xs text-gray-400 mt-1">Upload videos or photos to get started</p>
              <Button variant="outline" size="sm" onClick={() => setUploadModalOpen(true)} className="mt-4 gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                Upload Media
              </Button>
            </div>
          ) : view === 'list' ? (
            <VideoTable videos={filteredVideos} />
          ) : (
            <KanbanBoard videos={filteredVideos} onVideoUpdate={handleOptimisticUpdate} />
          )}
        </div>
      )}

      {/* ANALYTICS TAB */}
      {activeTab === 'analytics' && (
        <div className="animate-fade-in space-y-4">
          {analytics ? (
            <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-semibold text-gray-900">Workspace Analytics</h2>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-violet-50 border border-violet-100 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider mb-1">Total Posted</p>
                  <p className="text-2xl font-bold text-gray-900">{analytics.historical.totalEverPosted}</p>
                  <p className="text-[10px] text-gray-400">All time</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Total Media</p>
                  <p className="text-2xl font-bold text-gray-900">{analytics.current.total}</p>
                  <p className="text-[10px] text-gray-400">{totalVideoCount} videos, {totalPhotoCount} photos</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Approval Rate</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {analytics.current.total > 0 ? Math.round(((analytics.current.approved + analytics.current.posted) / analytics.current.total) * 100) : 0}%
                  </p>
                  <p className="text-[10px] text-gray-400">Approved + Posted</p>
                </div>
                <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-1">Needs Work</p>
                  <p className="text-2xl font-bold text-gray-900">{analytics.current.changesNeeded + analytics.current.rejected}</p>
                  <p className="text-[10px] text-gray-400">Changes + Rejected</p>
                </div>
              </div>

              {/* Status Breakdown */}
              <div className="border border-gray-100 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-700 mb-3">Status Breakdown</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Draft', count: stats.draft, color: 'bg-slate-400' },
                    { label: 'Pending', count: stats.pending, color: 'bg-amber-400' },
                    { label: 'Under Review', count: stats.underReview, color: 'bg-blue-400' },
                    { label: 'Approved', count: stats.approved, color: 'bg-emerald-400' },
                    { label: 'Changes Needed', count: stats.changesNeeded, color: 'bg-orange-400' },
                    { label: 'Rejected', count: stats.rejected, color: 'bg-red-400' },
                    { label: 'Posted', count: stats.posted, color: 'bg-violet-400' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                      <div className={`w-2 h-2 rounded-full ${item.color}`} />
                      <span className="text-[10px] text-gray-600 flex-1">{item.label}</span>
                      <span className="text-xs font-bold text-gray-900">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-gray-100 rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-gray-700 mb-3">Monthly Posted</h3>
                  {analytics.monthlyPosted.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">No data yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {analytics.monthlyPosted.slice(0, 6).map((item) => {
                        const maxCount = Math.max(...analytics.monthlyPosted.map(m => Number(m.count)));
                        const pct = maxCount > 0 ? (Number(item.count) / maxCount) * 100 : 0;
                        return (
                          <div key={item.month} className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 w-14 flex-shrink-0 font-mono">{format(new Date(item.month), 'MMM yy')}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                              <div className="h-full bg-violet-400 rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 4)}%` }} />
                            </div>
                            <span className="text-[10px] font-bold text-gray-700 w-6 text-right">{item.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="border border-gray-100 rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-gray-700 mb-3">Monthly Uploaded</h3>
                  {analytics.monthlyUploaded.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">No data yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {analytics.monthlyUploaded.slice(0, 6).map((item) => {
                        const maxCount = Math.max(...analytics.monthlyUploaded.map(m => Number(m.count)));
                        const pct = maxCount > 0 ? (Number(item.count) / maxCount) * 100 : 0;
                        return (
                          <div key={item.month} className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 w-14 flex-shrink-0 font-mono">{format(new Date(item.month), 'MMM yy')}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                              <div className="h-full bg-blue-400 rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 4)}%` }} />
                            </div>
                            <span className="text-[10px] font-bold text-gray-700 w-6 text-right">{item.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Activity */}
              {analytics.recentActivity.length > 0 && (
                <div className="border border-gray-100 rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-gray-700 mb-3">Recent Activity</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {analytics.recentActivity.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-xs">
                        <StatusDot status={item.status_changed_to} />
                        <span className="text-gray-700 truncate flex-1 font-medium">{item.video_filename}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium flex-shrink-0">{item.status_changed_to}</span>
                        <span className="text-gray-300 flex-shrink-0 text-[10px]">{format(new Date(item.changed_at), 'MMM d')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500">No analytics data available yet</p>
            </div>
          )}
        </div>
      )}

      {/* CHAT TAB */}
      {activeTab === 'chat' && workspace && (
        <div className="animate-fade-in">
          <WorkspaceChat workspaceId={workspace.id} className="h-[calc(100vh-280px)] min-h-[400px]" />
        </div>
      )}
      {activeTab === 'chat' && !workspace && (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
          <MessageCircle className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">Loading workspace chat...</p>
        </div>
      )}

      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadComplete={loadVideos}
        bucket={bucket}
        folderId={selectedFolder}
      />

      {showManageMembers && workspace && (
        <ManageMembersModal
          workspaceId={workspace.id}
          onClose={() => { setShowManageMembers(false); loadWorkspaceInfo(); }}
        />
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    'Draft': 'bg-slate-400', 'Pending': 'bg-amber-400', 'Under Review': 'bg-blue-400',
    'Approved': 'bg-emerald-400', 'Changes Needed': 'bg-orange-400', 'Rejected': 'bg-red-400', 'Posted': 'bg-violet-400',
  };
  return <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors[status] || 'bg-gray-300'}`} />;
}
