import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { videoService, workspaceService } from '@/services/api.service';
import { Video, VideoStatus, DashboardStats, Workspace, WorkspaceAnalytics } from '@/types';
import DashboardCards from '@/components/DashboardCards';
import VideoTable from '@/components/VideoTable';
import KanbanBoard from '@/components/KanbanBoard';
import ViewSwitcher from '@/components/ViewSwitcher';
import UploadModal from '@/components/UploadModal';
import WorkspaceChat from '@/components/WorkspaceChat';
import ManageMembersModal from '@/components/ManageMembersModal';
import { Button } from '@/components/ui/button';
import { Upload, ArrowLeft, Filter, MessageCircle, X, Users, BarChart3, Send, TrendingUp, Calendar as CalendarIcon, FileVideo as FileVideoIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [activeTab, setActiveTab] = useState<'videos' | 'chat' | 'analytics'>('chat');
  const [showManageMembers, setShowManageMembers] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [analytics, setAnalytics] = useState<WorkspaceAnalytics | null>(null);
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
    posted: 0,
  });

  // Short polling state for video list
  const pollHashRef = useRef<{ count: number; lastUpdated: string | null; lastCreated: string | null } | null>(null);

  const handleViewChange = (newView: 'list' | 'kanban') => {
    setView(newView);
    localStorage.setItem('viewMode', newView);
  };

  // Initial load
  useEffect(() => {
    if (bucket) {
      localStorage.setItem('currentBucket', bucket);
      loadVideos();
      loadWorkspaceInfo();
      loadAnalytics();
    }
  }, [bucket]);

  // Short polling: check for video changes every 4 seconds
  useEffect(() => {
    if (!bucket) return;
    const interval = setInterval(pollVideoChanges, 4000);
    return () => clearInterval(interval);
  }, [bucket]);

  useEffect(() => {
    filterVideos();
  }, [videos, dateFilter, statusFilter]);

  const loadVideos = async () => {
    if (!bucket) return;
    setLoading(true);
    try {
      const data = await videoService.getVideos(bucket);
      setVideos(data);
      calculateStats(data);
      // Store current poll hash
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

  // Silently refresh videos without showing loading spinner
  const refreshVideosSilent = useCallback(async () => {
    if (!bucket) return;
    try {
      const data = await videoService.getVideos(bucket);
      setVideos(data);
      calculateStats(data);
    } catch (error) {
      console.error('Failed to refresh videos:', error);
    }
  }, [bucket]);

  // Lightweight poll: only fetch full video list if something changed
  const pollVideoChanges = useCallback(async () => {
    if (!bucket) return;
    try {
      const hash = await videoService.pollVideos(bucket);
      const prev = pollHashRef.current;

      // Detect changes: count changed, or timestamps changed
      if (
        !prev ||
        hash.count !== prev.count ||
        hash.lastUpdated !== prev.lastUpdated ||
        hash.lastCreated !== prev.lastCreated
      ) {
        pollHashRef.current = hash;
        // Something changed — silently refresh the full video list
        await refreshVideosSilent();
      }
    } catch {
      // Silently fail — will retry in 4s
    }
  }, [bucket, refreshVideosSilent]);

  const loadWorkspaceInfo = async () => {
    try {
      const workspaces = await workspaceService.getWorkspaces();
      const ws = workspaces.find(w => w.bucket === bucket);
      if (ws) setWorkspace(ws);
    } catch (error) {
      console.error('Failed to load workspace info:', error);
    }
  };

  const loadAnalytics = async () => {
    if (!bucket) return;
    try {
      const data = await workspaceService.getAnalytics(bucket);
      setAnalytics(data);
    } catch (error) {
      // Analytics endpoint may fail if migration hasn't run yet
    }
  };

  const filterVideos = () => {
    let filtered = videos;

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(video => video.status === statusFilter);
    }

    // Date filter
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
      posted: videos.filter((v) => v.status === 'Posted').length,
    });
  };

  const activeFilters = (dateFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);

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
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Header Row */}
      <div className="flex flex-col gap-3">
        {/* Top: Back + Title */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-700 flex-shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <div className="h-4 w-px bg-gray-200 hidden sm:block" />
          <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{workspace?.client_name || bucket}</h1>
        </div>

        {/* Main Tab Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 flex-shrink-0">
            <button
              onClick={() => setActiveTab('videos')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'videos'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
              }`}
            >
              <FileVideoIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Videos
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'videos' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>
                {videos.length}
              </span>
            </button>
            {workspace && (
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'chat'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                }`}
              >
                <MessageCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Chat
              </button>
            )}
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'analytics'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Analytics
            </button>
          </div>

          <div className="h-5 w-px bg-gray-200 flex-shrink-0" />

          {/* Video filters - only show on Videos tab */}
          {activeTab === 'videos' && (
            <>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px] sm:w-[140px] h-8 text-xs border-dashed bg-white flex-shrink-0">
                  <Filter className="w-3.5 h-3.5 mr-1.5 text-gray-500" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent align="end">
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
                <SelectTrigger className="w-[110px] sm:w-[130px] h-8 text-xs border-dashed bg-white flex-shrink-0">
                  <CalendarIcon className="w-3.5 h-3.5 mr-1.5 text-gray-500" />
                  <SelectValue placeholder="Date" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>

              {activeFilters > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setDateFilter('all'); setStatusFilter('all'); }}
                  className="h-8 text-xs text-gray-500 hover:text-gray-700 flex-shrink-0 gap-1"
                >
                  <X className="h-3 w-3" />
                  Clear ({activeFilters})
                </Button>
              )}

              <ViewSwitcher view={view} onViewChange={handleViewChange} />
            </>
          )}

          <div className="flex-1" />

          {workspace && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowManageMembers(true)}
              className="gap-1 sm:gap-1.5 flex-shrink-0 h-8 text-xs"
            >
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Members</span>
            </Button>
          )}

          <Button onClick={() => setUploadModalOpen(true)} size="sm" className="gap-1 sm:gap-2 flex-shrink-0 h-8 text-xs">
            <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Upload
          </Button>
        </div>
      </div>

      {activeTab === 'videos' && (
        <div className="animate-fade-in-up">
          <DashboardCards stats={stats} totalEverPosted={analytics?.historical.totalEverPosted} />
        </div>
      )}

      {/* Analytics Panel */}
      {activeTab === 'analytics' && analytics && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm animate-fade-in-up space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900">Workspace Analytics</h2>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-violet-50 border border-violet-100 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Send className="h-3.5 w-3.5 text-violet-600" />
                <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Total Posted</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{analytics.historical.totalEverPosted}</div>
              <p className="text-[10px] text-gray-400 mt-0.5">All time (includes deleted)</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Active Videos</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{analytics.current.total}</div>
              <p className="text-[10px] text-gray-400 mt-0.5">Currently in workspace</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Approval Rate</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {analytics.current.total > 0 ? Math.round(((analytics.current.approved + analytics.current.posted) / analytics.current.total) * 100) : 0}%
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">Approved + Posted</p>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider">Needs Work</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {analytics.current.changesNeeded + analytics.current.rejected}
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">Changes Needed + Rejected</p>
            </div>
          </div>

          {/* Monthly Activity Charts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Monthly Posted */}
            <div className="border border-gray-100 rounded-lg p-3">
              <h3 className="text-xs font-semibold text-gray-700 mb-3">Monthly Posted Videos</h3>
              {analytics.monthlyPosted.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">No data yet</p>
              ) : (
                <div className="space-y-1.5">
                  {analytics.monthlyPosted.slice(0, 6).map((item) => {
                    const maxCount = Math.max(...analytics.monthlyPosted.map(m => Number(m.count)));
                    const pct = maxCount > 0 ? (Number(item.count) / maxCount) * 100 : 0;
                    return (
                      <div key={item.month} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-14 flex-shrink-0 font-mono">
                          {format(new Date(item.month), 'MMM yy')}
                        </span>
                        <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                          <div
                            className="h-full bg-violet-400 rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(pct, 4)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-gray-700 w-6 text-right">{item.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Monthly Uploaded */}
            <div className="border border-gray-100 rounded-lg p-3">
              <h3 className="text-xs font-semibold text-gray-700 mb-3">Monthly Uploaded Videos</h3>
              {analytics.monthlyUploaded.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">No data yet</p>
              ) : (
                <div className="space-y-1.5">
                  {analytics.monthlyUploaded.slice(0, 6).map((item) => {
                    const maxCount = Math.max(...analytics.monthlyUploaded.map(m => Number(m.count)));
                    const pct = maxCount > 0 ? (Number(item.count) / maxCount) * 100 : 0;
                    return (
                      <div key={item.month} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-14 flex-shrink-0 font-mono">
                          {format(new Date(item.month), 'MMM yy')}
                        </span>
                        <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                          <div
                            className="h-full bg-blue-400 rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(pct, 4)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-gray-700 w-6 text-right">{item.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent Status Activity */}
          {analytics.recentActivity.length > 0 && (
            <div className="border border-gray-100 rounded-lg p-3">
              <h3 className="text-xs font-semibold text-gray-700 mb-3">Recent Activity</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {analytics.recentActivity.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-xs">
                    <StatusDot status={item.status_changed_to} />
                    <span className="text-gray-700 truncate flex-1 font-medium">{item.video_filename}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium flex-shrink-0">
                      {item.status_changed_to}
                    </span>
                    {item.changed_by_name && (
                      <span className="text-gray-400 flex-shrink-0 hidden sm:inline">{item.changed_by_name}</span>
                    )}
                    <span className="text-gray-300 flex-shrink-0 text-[10px]">
                      {format(new Date(item.changed_at), 'MMM d')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'analytics' && !analytics && (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">No analytics data available yet</p>
        </div>
      )}

      {/* Videos Tab */}
      {activeTab === 'videos' && (
        <div className="animate-fade-in">
          {filteredVideos.length === 0 ? (
            <div className="text-center py-10 sm:py-12 bg-white rounded-xl border border-dashed border-gray-300">
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
      )}

      {/* Chat Tab - Full Width */}
      {activeTab === 'chat' && workspace && (
        <div className="animate-fade-in">
          <WorkspaceChat workspaceId={workspace.id} />
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
      />

      {showManageMembers && workspace && (
        <ManageMembersModal
          workspaceId={workspace.id}
          onClose={() => {
            setShowManageMembers(false);
            loadWorkspaceInfo();
          }}
        />
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    'Draft': 'bg-slate-400',
    'Pending': 'bg-amber-400',
    'Under Review': 'bg-blue-400',
    'Approved': 'bg-emerald-400',
    'Changes Needed': 'bg-orange-400',
    'Rejected': 'bg-red-400',
    'Posted': 'bg-violet-400',
  };
  return <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors[status] || 'bg-gray-300'}`} />;
}
