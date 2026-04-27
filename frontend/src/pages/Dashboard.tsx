import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { workspaceService } from '@/services/api.service';
import { Workspace } from '@/types';
import { Button } from '@/components/ui/button';
import { Toast } from '@/components/ui/toast';
import {
  FolderOpen, Plus, Users, Video,
  Link as LinkIcon, ExternalLink, MoreHorizontal,
  Trash2, Search, ArrowUpRight
} from 'lucide-react';
import CreateWorkspaceModal from '@/components/CreateWorkspaceModal';
import DeleteWorkspaceModal from '@/components/DeleteWorkspaceModal';
import { getApiUrl } from '@/lib/utils';

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
    // Exponential backoff polling: 5s → 10s → 20s → 30s max, resets on window focus
    let delay = 5000;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refreshWorkspacesSilent();
      delay = Math.min(delay * 1.5, 30000);
      timer = setTimeout(poll, delay);
    };
    timer = setTimeout(poll, delay);
    const resetDelay = () => { delay = 5000; };
    window.addEventListener('focus', resetDelay);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', resetDelay);
    };
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
      try {
        await navigator.clipboard.writeText(inviteUrl);
        setToast({ message: 'Invite link copied!', type: 'success' });
      } catch {
        // Fallback for browsers that deny clipboard permission
        prompt('Copy this invite link:', inviteUrl);
      }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gray-900 dark:bg-gray-950 rounded-2xl">
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        {/* Soft glow */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl" />

        <div className="relative px-6 sm:px-8 py-6 sm:py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            {/* Digitech logo mark */}
            <div className="hidden sm:flex w-12 h-12 rounded-xl bg-white/10 border border-white/10 items-center justify-center flex-shrink-0">
              <img src="/digitech-logo-light.svg" alt="" className="h-8 w-auto" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                Welcome, {userName}
              </h1>
              <div className="flex items-center gap-4 mt-1.5 text-sm text-gray-400">
                <span>{workspaces.length} workspaces</span>
                <span className="text-gray-600">/</span>
                <span>{totalVideos} videos</span>
                <span className="text-gray-600">/</span>
                <span>{totalMembers} members</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={() => navigate('/users')} className="text-xs h-8 bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white">
                  <Users className="h-3.5 w-3.5 mr-1.5" /> Team
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/recycle-bin')} className="text-xs h-8 bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white">
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Bin
                </Button>
              </>
            )}
            {canCreateWorkspace && (
              <Button onClick={() => setShowCreateModal(true)} size="sm" className="text-xs h-8 bg-white text-gray-900 hover:bg-gray-100">
                <Plus className="h-3.5 w-3.5 mr-1.5" /> New Client
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 xs:grid-cols-3 gap-3">
        {[
          { label: 'Workspaces', value: workspaces.length },
          { label: 'Total Videos', value: totalVideos },
          { label: 'Team Members', value: totalMembers },
        ].map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700 rounded-xl px-4 py-3.5">
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Workspace Header + Search */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {isOrgRole ? 'Client Workspaces' : 'Your Workspaces'}
          <span className="text-gray-400 dark:text-gray-400 font-normal ml-2">{filteredWorkspaces.length}</span>
        </h2>
        {workspaces.length > 3 && (
          <div className="relative w-40 sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-100 focus:border-transparent transition-shadow"
            />
          </div>
        )}
      </div>

      {/* Workspaces Grid */}
      {workspaces.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-12 text-center">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 text-gray-200 dark:text-gray-700" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">No workspaces yet</p>
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
              className={`group bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700 rounded-xl p-4 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md transition-all cursor-pointer relative animate-fade-in-up ${contextMenu === workspace.id ? 'z-50' : ''}`}
              style={{ animationDelay: `${i * 25}ms`, animationFillMode: 'both' }}
              onClick={() => navigate(`/workspace/${workspace.bucket}`)}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                {workspace.client_logo ? (
                  <img src={getApiUrl(workspace.client_logo)} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-100 dark:border-gray-700 flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-gray-900 dark:bg-gray-700 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                    {workspace.client_name.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                    {workspace.client_name}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Video className="h-3 w-3" /> {workspace.video_count} videos
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {workspace.member_count}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                {canCreateWorkspace && (
                  <div className="context-menu-container flex-shrink-0 relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setContextMenu(contextMenu === workspace.id ? null : workspace.id)}
                      className="p-1 rounded-md text-gray-300 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>

                    {contextMenu === workspace.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
                        <div className="absolute right-0 top-8 w-52 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-50 py-1.5 animate-scale-in">
                          <button
                            onClick={() => handleCreateInvitation(workspace.id)}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          >
                            <LinkIcon className="h-3.5 w-3.5 text-gray-400" /> Copy Invite Link
                          </button>
                          <button
                            onClick={() => { navigate(`/workspace/${workspace.bucket}`); setContextMenu(null); }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-gray-400" /> Open Workspace
                          </button>
                          {isAdmin && (
                            <>
                              <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                              <button
                                onClick={() => { setWorkspaceToDelete(workspace); setContextMenu(null); }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete Workspace
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Hover arrow indicator */}
              <div className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowUpRight className="h-3.5 w-3.5 text-gray-300" />
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
