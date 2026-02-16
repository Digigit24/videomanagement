import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { workspaceService } from '@/services/api.service';
import { Workspace } from '@/types';
import { Button } from '@/components/ui/button';
import {
  FolderOpen, Plus, Users, Video,
  Settings, ChevronRight, Link as LinkIcon, ExternalLink, MoreHorizontal,
  Trash2
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
  const canCreateWorkspace = ['admin', 'project_manager'].includes(userRole);
  const isOrgRole = ['admin', 'video_editor', 'project_manager', 'social_media_manager'].includes(userRole);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      const ws = await workspaceService.getWorkspaces();
      
      // Auto-redirect for clients with single workspace
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
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Welcome back, {userName} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isOrgRole
              ? `Manage ${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} — ${totalVideos} video${totalVideos === 1 ? '' : 's'} across teams`
              : `You have access to ${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'}`
            }
          </p>
        </div>

        {canCreateWorkspace && (
          <Button onClick={() => setShowCreateModal(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Client
          </Button>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <FolderOpen className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-gray-500 font-medium">Workspaces</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{workspaces.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Video className="h-4 w-4 text-purple-500" />
            <span className="text-xs text-gray-500 font-medium">Videos</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalVideos}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-gray-500 font-medium">Members</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalMembers}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Settings className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-gray-500 font-medium">Role</span>
          </div>
          <p className="text-sm font-bold text-gray-900 capitalize">{userRole.replace('_', ' ')}</p>
        </div>
      </div>

      {/* Quick Actions */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-gray-800 to-gray-950 rounded-xl p-5 text-white">
          <h3 className="text-sm font-semibold mb-3">Quick Actions</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white text-xs"
              onClick={() => navigate('/users')}
            >
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Manage Team
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white text-xs"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create Workspace
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white text-xs"
              onClick={() => navigate('/recycle-bin')}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Recycle Bin
            </Button>
          </div>
        </div>
      )}

      {/* Workspaces Grid */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          {isOrgRole ? 'All Client Workspaces' : 'Your Workspaces'}
        </h2>

        {workspaces.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center">
            <FolderOpen className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <h3 className="text-sm font-medium text-gray-600">No workspaces yet</h3>
            <p className="text-xs text-gray-400 mt-1">
              {canCreateWorkspace
                ? 'Create your first client workspace to get started'
                : 'You\'ll see workspaces here once you\'re added to one'}
            </p>
            {canCreateWorkspace && (
              <Button onClick={() => setShowCreateModal(true)} size="sm" className="mt-4">
                <Plus className="h-4 w-4 mr-1" />
                Create Workspace
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map(workspace => (
              <div
                key={workspace.id}
                className="group bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-md transition-all overflow-hidden cursor-pointer"
                onClick={() => navigate(`/workspace/${workspace.bucket}`)}
              >
                {/* Card Header */}
                <div className="p-4 pb-2">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      {workspace.client_logo ? (
                        <img src={getApiUrl(workspace.client_logo)} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-100" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                          {workspace.client_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                          {workspace.client_name}
                        </h3>
                        <p className="text-[10px] text-gray-400 font-mono">{workspace.bucket}</p>
                      </div>
                    </div>

                    {/* Context menu */}
                    {canCreateWorkspace && (
                      <div className="relative flex items-center">
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setWorkspaceToDelete(workspace);
                            }}
                            className="p-1 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors mr-1"
                            title="Delete Workspace"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setContextMenu(contextMenu === workspace.id ? null : workspace.id);
                          }}
                          className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>

                          {contextMenu === workspace.id && (
                          <div className="absolute right-0 top-7 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => { handleCreateInvitation(workspace.id); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 text-left"
                            >
                              <LinkIcon className="h-3.5 w-3.5" />
                              Copy Invite Link
                            </button>
                            <button
                              onClick={() => { navigate(`/workspace/${workspace.bucket}`); setContextMenu(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 text-left"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Open Workspace
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => { setWorkspaceToDelete(workspace); setContextMenu(null); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 text-left"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete Workspace
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer Stats */}
                <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center gap-4">
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Video className="h-3 w-3" />
                    <span>{workspace.video_count} videos</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Users className="h-3 w-3" />
                    <span>{workspace.member_count} members</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-gray-300 ml-auto group-hover:text-blue-400 transition-colors" />
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

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
