import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { workspaceService } from '@/services/api.service';
import { Workspace } from '@/types';
import { Button } from '@/components/ui/button';
import { Toast } from '@/components/ui/toast';
import {
  FolderOpen, Plus, Users, Video,
  Link as LinkIcon, ExternalLink, MoreHorizontal,
  Trash2, TrendingUp, Layers, Search
} from 'lucide-react';
import CreateWorkspaceModal from '@/components/CreateWorkspaceModal';
import DeleteWorkspaceModal from '@/components/DeleteWorkspaceModal';
import { getApiUrl } from '@/lib/utils';

// Gradient palette for workspace avatars
const GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-violet-500 to-purple-600',
  'from-pink-500 to-rose-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-blue-600',
  'from-fuchsia-500 to-pink-600',
  'from-lime-500 to-green-600',
  'from-sky-500 to-indigo-600',
  'from-red-500 to-rose-600',
];

export default function Dashboard() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'loading'; persistent?: boolean } | null>(null);
  const [contextMenu, setContextMenu] = useState<string | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const userRole = localStorage.getItem('userRole') || 'member';
  const userName = localStorage.getItem('userName') || 'User';
  const isAdmin = userRole === 'admin';
  const canCreateWorkspace = ['admin', 'project_manager', 'social_media_manager'].includes(userRole);
  const isOrgRole = ['admin', 'video_editor', 'project_manager', 'social_media_manager', 'videographer', 'photo_editor'].includes(userRole);

  useEffect(() => {
    loadWorkspaces();
    const interval = setInterval(refreshWorkspacesSilent, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.context-menu-container')) {
        setContextMenu(null);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  const refreshWorkspacesSilent = async () => {
    try {
      const ws = await workspaceService.getWorkspaces();
      setWorkspaces(ws);
    } catch {}
  };

  const loadWorkspaces = async () => {
    try {
      const ws = await workspaceService.getWorkspaces();
      if (userRole === 'client' && ws.length === 1) {
        navigate(`/workspace/${ws[0].bucket}`);
        return;
      }
      setWorkspaces(ws);
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvitation = async (workspaceId: string) => {
    try {
      const invitation = await workspaceService.createInvitation(workspaceId);
      const inviteUrl = `${window.location.origin}/invite/${invitation.code}`;
      await navigator.clipboard.writeText(inviteUrl);
      setToast({ message: 'Invite link copied!', type: 'success' });
    } catch (error) {
      setToast({ message: 'Failed to create invite', type: 'error' });
    }
    setContextMenu(null);
  };

  const totalVideos = workspaces.reduce((sum, w) => sum + (Number(w.video_count) || 0), 0);
  const totalMembers = workspaces.reduce((sum, w) => sum + (Number(w.member_count) || 0), 0);

  const filteredWorkspaces = searchQuery
    ? workspaces.filter(w => w.client_name.toLowerCase().includes(searchQuery.toLowerCase()))
    : workspaces;

  const getGradient = (index: number) => GRADIENTS[index % GRADIENTS.length];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 rounded-2xl p-6 sm:p-8">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        {/* Digitech logo watermark - subtle background */}
        <div className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 opacity-[0.06] pointer-events-none hidden sm:block">
          <img src="/digitech-logo-light.svg" alt="" className="h-32 w-auto" />
        </div>
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <img src="/digitech-logo-light.svg" alt="Digitech Solutions" className="h-8 w-auto opacity-80" />
            </div>
            <p className="text-blue-300 text-xs font-medium tracking-wider uppercase mb-1">Welcome back</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              {userName}
            </h1>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-blue-200 text-sm">
                <Layers className="h-4 w-4" />
                <span className="font-semibold">{workspaces.length}</span>
                <span className="text-blue-300/70">workspaces</span>
              </div>
              <div className="flex items-center gap-1.5 text-blue-200 text-sm">
                <Video className="h-4 w-4" />
                <span className="font-semibold">{totalVideos}</span>
                <span className="text-blue-300/70">videos</span>
              </div>
              <div className="flex items-center gap-1.5 text-blue-200 text-sm">
                <Users className="h-4 w-4" />
                <span className="font-semibold">{totalMembers}</span>
                <span className="text-blue-300/70">members</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={() => navigate('/users')} className="text-xs h-9 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">
                  <Users className="h-3.5 w-3.5 mr-1.5" /> Team
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/recycle-bin')} className="text-xs h-9 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Bin
                </Button>
              </>
            )}
            {canCreateWorkspace && (
              <Button onClick={() => setShowCreateModal(true)} size="sm" className="text-xs h-9 bg-white text-gray-900 hover:bg-gray-100">
                <Plus className="h-3.5 w-3.5 mr-1.5" /> New Client
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Layers className="h-4 w-4 text-blue-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Workspaces</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{workspaces.length}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
              <Video className="h-4 w-4 text-violet-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Total Videos</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalVideos}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Users className="h-4 w-4 text-emerald-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Team Members</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalMembers}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-amber-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Avg Videos</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {workspaces.length > 0 ? Math.round(totalVideos / workspaces.length) : 0}
          </p>
        </div>
      </div>

      {/* Workspace Header + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">
          {isOrgRole ? 'Client Workspaces' : 'Your Workspaces'}
        </h2>
        {workspaces.length > 5 && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search workspaces..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}
      </div>

      {/* Workspaces Grid */}
      {workspaces.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-12 text-center">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-500 mb-1">No workspaces yet</p>
          <p className="text-xs text-gray-400 mb-4">
            {canCreateWorkspace ? 'Create your first workspace to get started' : 'You\'ll see workspaces here once added'}
          </p>
          {canCreateWorkspace && (
            <Button onClick={() => setShowCreateModal(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Create Workspace
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredWorkspaces.map((workspace, i) => (
            <div
              key={workspace.id}
              className="group bg-white border border-gray-100 rounded-xl overflow-hidden hover:border-gray-200 hover:shadow-lg transition-all cursor-pointer relative animate-fade-in-up"
              style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}
              onClick={() => navigate(`/workspace/${workspace.bucket}`)}
            >
              {/* Colored top strip */}
              <div className={`h-1.5 bg-gradient-to-r ${getGradient(i)}`} />

              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  {workspace.client_logo ? (
                    <img src={getApiUrl(workspace.client_logo)} alt="" className="w-11 h-11 rounded-xl object-cover border border-gray-100 flex-shrink-0" />
                  ) : (
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getGradient(i)} flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm`}>
                      {workspace.client_name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                      {workspace.client_name}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <Video className="h-3 w-3" /> {workspace.video_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {workspace.member_count}
                      </span>
                    </div>
                  </div>

                  {/* Actions menu */}
                  {canCreateWorkspace && (
                    <div className="context-menu-container flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setContextMenu(contextMenu === workspace.id ? null : workspace.id)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      {contextMenu === workspace.id && (
                        <div className="absolute right-3 top-14 w-48 bg-white border border-gray-200 rounded-xl shadow-2xl z-20 py-1 animate-scale-in">
                          <button
                            onClick={() => handleCreateInvitation(workspace.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <LinkIcon className="h-3.5 w-3.5 text-gray-400" /> Copy Invite Link
                          </button>
                          <button
                            onClick={() => { navigate(`/workspace/${workspace.bucket}`); setContextMenu(null); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-gray-400" /> Open Workspace
                          </button>
                          {isAdmin && (
                            <>
                              <div className="border-t border-gray-100 my-1" />
                              <button
                                onClick={() => { setWorkspaceToDelete(workspace); setContextMenu(null); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete Workspace
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search empty state */}
      {searchQuery && filteredWorkspaces.length === 0 && workspaces.length > 0 && (
        <div className="text-center py-8">
          <Search className="h-8 w-8 mx-auto mb-2 text-gray-200" />
          <p className="text-sm text-gray-500">No workspaces match "{searchQuery}"</p>
          <button onClick={() => setSearchQuery('')} className="text-xs text-blue-600 hover:text-blue-700 mt-1">Clear search</button>
        </div>
      )}

      {showCreateModal && (
        <CreateWorkspaceModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(workspace) => {
            setWorkspaces([workspace, ...workspaces]);
            setShowCreateModal(false);
            setToast({ message: `Workspace "${workspace.client_name}" created!`, type: 'success' });
          }}
        />
      )}

      {workspaceToDelete && (
        <DeleteWorkspaceModal
          workspaceId={workspaceToDelete.id}
          workspaceName={workspaceToDelete.client_name}
          onClose={() => setWorkspaceToDelete(null)}
          onDeleted={(id) => {
            setWorkspaces(workspaces.filter(w => w.id !== id));
            setWorkspaceToDelete(null);
            setToast({ message: 'Workspace deleted successfully', type: 'success' });
          }}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} persistent={toast.persistent} onClose={() => setToast(null)} />}
    </div>
  );
}
