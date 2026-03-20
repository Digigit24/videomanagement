import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { workspaceService } from '@/services/api.service';
import { Workspace } from '@/types';
import { Button } from '@/components/ui/button';
import {
  FolderOpen, Plus, Users, Video,
  Link as LinkIcon, ExternalLink, MoreHorizontal,
  Trash2, ChevronRight, ArrowRight
} from 'lucide-react';
import CreateWorkspaceModal from '@/components/CreateWorkspaceModal';
import DeleteWorkspaceModal from '@/components/DeleteWorkspaceModal';
import { Toast } from '@/components/ui/toast';
import { getApiUrl } from '@/lib/utils';

export default function Dashboard() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [contextMenu, setContextMenu] = useState<string | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null);
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

  // Close context menu on outside click
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8 animate-fade-in">
      {/* Hero section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Hi, {userName}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isOrgRole
              ? `${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} \u00b7 ${totalVideos} video${totalVideos === 1 ? '' : 's'}`
              : `${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} available`
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate('/users')} className="text-xs h-9">
                <Users className="h-3.5 w-3.5 mr-1.5" /> Team
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/recycle-bin')} className="text-xs h-9">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Bin
              </Button>
            </>
          )}
          {canCreateWorkspace && (
            <Button onClick={() => setShowCreateModal(true)} size="sm" className="text-xs h-9">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New Client
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Workspaces', value: workspaces.length, color: 'text-blue-600' },
          { label: 'Total Videos', value: totalVideos, color: 'text-violet-600' },
          { label: 'Team Members', value: totalMembers, color: 'text-emerald-600' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-gray-100 rounded-xl p-4 text-center">
            <p className={`text-2xl sm:text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-[11px] text-gray-400 font-medium mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Workspaces */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          {isOrgRole ? 'Client Workspaces' : 'Your Workspaces'}
        </h2>

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {workspaces.map((workspace, i) => (
              <div
                key={workspace.id}
                className="group bg-white border border-gray-100 rounded-xl p-4 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer relative animate-fade-in-up"
                style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'both' }}
                onClick={() => navigate(`/workspace/${workspace.bucket}`)}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  {workspace.client_logo ? (
                    <img src={getApiUrl(workspace.client_logo)} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-100 flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {workspace.client_name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                      {workspace.client_name}
                    </h3>
                    <div className="flex items-center gap-2.5 mt-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Video className="h-3 w-3" /> {workspace.video_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {workspace.member_count}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  {canCreateWorkspace && (
                    <div className="context-menu-container flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setContextMenu(contextMenu === workspace.id ? null : workspace.id)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      {contextMenu === workspace.id && (
                        <div className="absolute right-3 top-12 w-44 bg-white border border-gray-200 rounded-xl shadow-xl z-20 py-1 animate-scale-in">
                          <button
                            onClick={() => handleCreateInvitation(workspace.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <LinkIcon className="h-3.5 w-3.5" /> Copy Invite Link
                          </button>
                          <button
                            onClick={() => { navigate(`/workspace/${workspace.bucket}`); setContextMenu(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> Open
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => { setWorkspaceToDelete(workspace); setContextMenu(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Subtle arrow on hover */}
                <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="h-4 w-4 text-gray-300" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
