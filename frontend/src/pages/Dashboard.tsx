import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { workspaceService } from '@/services/api.service';
import { Workspace } from '@/types';
import { Button } from '@/components/ui/button';
import {
  FolderOpen, Plus, Users, Video,
  Settings, Link as LinkIcon, ExternalLink, MoreHorizontal,
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
  const canCreateWorkspace = ['admin', 'project_manager', 'social_media_manager'].includes(userRole);
  const isOrgRole = ['admin', 'video_editor', 'project_manager', 'social_media_manager'].includes(userRole);

  useEffect(() => {
    loadWorkspaces();
    // Short polling: refresh workspace data every 4 seconds to catch new uploads
    const interval = setInterval(refreshWorkspacesSilent, 4000);
    return () => clearInterval(interval);
  }, []);

  const refreshWorkspacesSilent = async () => {
    try {
      const ws = await workspaceService.getWorkspaces();
      setWorkspaces(ws);
    } catch {
      // Silently fail — will retry in 4s
    }
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
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Welcome Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="animate-fade-in-up">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">
            Welcome back, {userName}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            {isOrgRole
              ? `Manage ${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} — ${totalVideos} video${totalVideos === 1 ? '' : 's'} across teams`
              : `You have access to ${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'}`
            }
          </p>
        </div>

        {canCreateWorkspace && (
          <Button onClick={() => setShowCreateModal(true)} className="gap-1.5 w-full sm:w-auto animate-fade-in">
            <Plus className="h-4 w-4" />
            New Client
          </Button>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { icon: FolderOpen, color: 'text-blue-500', label: 'Workspaces', value: workspaces.length },
          { icon: Video, color: 'text-purple-500', label: 'Videos', value: totalVideos },
          { icon: Users, color: 'text-emerald-500', label: 'Members', value: totalMembers },
          { icon: Settings, color: 'text-amber-500', label: 'Role', value: userRole.replace('_', ' ') },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 animate-fade-in-up transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
            style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${stat.color}`} />
              <span className="text-[10px] sm:text-xs text-gray-500 font-medium">{stat.label}</span>
            </div>
            {stat.label === 'Role' ? (
              <p className="text-xs sm:text-sm font-bold text-gray-900 capitalize">{stat.value}</p>
            ) : (
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{stat.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-gray-800 to-gray-950 rounded-xl p-4 sm:p-5 text-white animate-fade-in-up">
          <h3 className="text-sm font-semibold mb-3">Quick Actions</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white text-xs transition-all duration-200"
              onClick={() => navigate('/users')}
            >
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Manage Team
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white text-xs transition-all duration-200"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create Workspace
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white text-xs transition-all duration-200"
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
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 sm:p-10 text-center animate-fade-in">
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
          <div className="flex flex-col bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 shadow-sm">
            {workspaces.map((workspace, i) => (
              <div
                key={workspace.id}
                className={`group flex items-center gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-gray-50 transition-all duration-200 cursor-pointer relative animate-fade-in-up first:rounded-t-xl last:rounded-b-xl ${contextMenu === workspace.id ? 'z-30' : ''}`}
                style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
                onClick={() => navigate(`/workspace/${workspace.bucket}`)}
              >
                {/* Avatar */}
                <div className="flex-shrink-0">
                  {workspace.client_logo ? (
                    <img src={getApiUrl(workspace.client_logo)} alt="" className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border border-gray-100" />
                  ) : (
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-base sm:text-lg font-bold shadow-sm transition-transform duration-200 group-hover:scale-105">
                      {workspace.client_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                      {workspace.client_name}
                    </h3>
                    <div className="flex items-center gap-2">
                       {canCreateWorkspace && (
                        <div
                          className={`transition-opacity ${contextMenu === workspace.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
                               setContextMenu(contextMenu === workspace.id ? null : workspace.id);
                             }}
                             className="p-1.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                           >
                             <MoreHorizontal className="h-4 w-4" />
                           </button>

                           {contextMenu === workspace.id && (
                             <div className="absolute right-3 sm:right-4 top-10 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-20 py-1 overflow-hidden animate-scale-in">
                               <button
                                 onClick={(e) => { e.stopPropagation(); handleCreateInvitation(workspace.id); }}
                                 className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 text-left"
                               >
                                 <LinkIcon className="h-3.5 w-3.5" />
                                 Copy Invite Link
                               </button>
                               <button
                                 onClick={() => { navigate(`/workspace/${workspace.bucket}`); setContextMenu(null); }}
                                 className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 text-left"
                               >
                                 <ExternalLink className="h-3.5 w-3.5" />
                                 Open Workspace
                               </button>
                               {isAdmin && (
                                 <button
                                   onClick={() => { setWorkspaceToDelete(workspace); setContextMenu(null); }}
                                   className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50 text-left"
                                 >
                                   <Trash2 className="h-3.5 w-3.5" />
                                   Delete Workspace
                                 </button>
                               )}
                             </div>
                           )}
                        </div>
                       )}

                       <span className="hidden sm:inline text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100 font-mono">
                         {workspace.bucket}
                       </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs sm:text-sm text-gray-500 truncate">
                    <div className="flex items-center gap-1">
                      <Video className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      <span>{workspace.video_count} videos</span>
                    </div>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      <span>{workspace.member_count} members</span>
                    </div>
                  </div>
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
