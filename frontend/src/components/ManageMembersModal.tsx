import { useState, useEffect } from 'react';
import { workspaceService, userService, permissionService } from '@/services/api.service';
import { User, WorkspaceMember, WorkspacePermissions } from '@/types';
import { X, Users, Plus, Trash2, Search, Shield, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface ManageMembersModalProps {
  workspaceId: string;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  video_editor: 'Video Editor',
  project_manager: 'Project Manager',
  social_media_manager: 'Social Media Manager',
  client: 'Client',
  member: 'Member',
  videographer: 'Videographer',
  photo_editor: 'Photo Editor',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  video_editor: 'bg-blue-100 text-blue-700',
  project_manager: 'bg-amber-100 text-amber-700',
  social_media_manager: 'bg-emerald-100 text-emerald-700',
  client: 'bg-teal-100 text-teal-700',
  member: 'bg-gray-100 text-gray-600',
  videographer: 'bg-indigo-100 text-indigo-700',
  photo_editor: 'bg-pink-100 text-pink-700',
};

const PERMISSION_LABELS: Record<string, string> = {
  can_upload: 'Upload Media',
  can_delete: 'Delete Media',
  can_change_status: 'Change Status',
  can_change_video_status: 'Change Video Status',
  can_add_member: 'Add Members',
  can_remove_member: 'Remove Members',
  can_create_folder: 'Create Folders',
  can_delete_folder: 'Delete Folders',
  can_manage_permissions: 'Manage Permissions',
};

export default function ManageMembersModal({ workspaceId, onClose }: ManageMembersModalProps) {
  const [currentMembers, setCurrentMembers] = useState<WorkspaceMember[]>([]);
  const [allOrgMembers, setAllOrgMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [memberPerms, setMemberPerms] = useState<Record<string, WorkspacePermissions>>({});
  const [savingPerms, setSavingPerms] = useState<string | null>(null);

  const currentUserRole = localStorage.getItem('userRole') || 'member';
  const canManagePermissions = ['admin', 'project_manager', 'social_media_manager'].includes(currentUserRole);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [members, orgUsers] = await Promise.all([
        workspaceService.getMembers(workspaceId),
        userService.getOrgMembers()
      ]);
      setCurrentMembers(members);
      setAllOrgMembers(orgUsers);
    } catch (err) {
      console.error('Failed to load members:', err);
      setError('Failed to load member data');
    } finally {
      setLoading(false);
    }
  };

  const loadMemberPermissions = async (userId: string) => {
    try {
      const perms = await permissionService.getUserPermissions(workspaceId, userId);
      setMemberPerms(prev => ({ ...prev, [userId]: perms }));
    } catch (err) {
      console.error('Failed to load permissions:', err);
    }
  };

  const handleToggleMember = (memberId: string) => {
    if (expandedMember === memberId) {
      setExpandedMember(null);
    } else {
      setExpandedMember(memberId);
      if (!memberPerms[memberId]) {
        loadMemberPermissions(memberId);
      }
    }
  };

  const handleTogglePermission = async (userId: string, key: string) => {
    const current = memberPerms[userId];
    if (!current) return;

    const updated = { ...current, [key]: !(current as any)[key] };
    setMemberPerms(prev => ({ ...prev, [userId]: updated }));

    try {
      setSavingPerms(userId);
      await permissionService.updatePermissions(workspaceId, userId, updated);
    } catch (err: any) {
      // Revert on error
      setMemberPerms(prev => ({ ...prev, [userId]: current }));
      setError(err.response?.data?.error || 'Failed to update permissions');
    } finally {
      setSavingPerms(null);
    }
  };

  const handleAddMember = async (userId: string) => {
    try {
      await workspaceService.addMember(workspaceId, userId);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add member');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    const member = currentMembers.find(m => m.id === userId);

    // Prevent removing admin users
    if (member?.role === 'admin') {
      setError('Admin users cannot be removed from workspaces');
      return;
    }

    if (!confirm(`Remove ${member?.name || 'this member'} from workspace?`)) return;
    setError('');
    try {
      await workspaceService.removeMember(workspaceId, userId);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove member');
    }
  };

  const isMember = (userId: string) => currentMembers.some(m => m.id === userId);

  const filteredOrgMembers = allOrgMembers.filter(user =>
    (user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     user.email?.toLowerCase().includes(searchQuery.toLowerCase())) &&
    !isMember(user.id!)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Manage Workspace Members</h2>
            <p className="text-xs text-gray-400 mt-0.5">Add or remove team members and manage permissions</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
              {error}
              <button onClick={() => setError('')} className="float-right text-red-400 hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Current Members Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <Users className="h-3.5 w-3.5" />
              Current Members ({currentMembers.length})
            </h3>
            <div className="space-y-2">
              {currentMembers.map((member) => (
                <div key={member.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-3 bg-gray-50 group">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-medium uppercase">
                          {member.name?.charAt(0) || '?'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{member.name}</p>
                        <p className="text-xs text-gray-400 truncate">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${ROLE_COLORS[member.role] || 'bg-gray-100 text-gray-500'}`}>
                        {ROLE_LABELS[member.role] || member.role}
                      </span>
                      {canManagePermissions && (
                        <button
                          onClick={() => handleToggleMember(member.id)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Manage Permissions"
                        >
                          {expandedMember === member.id ? <ChevronDown className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                        </button>
                      )}
                      {member.role !== 'admin' ? (
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Remove Member"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="text-[9px] text-purple-500 font-medium px-2">Protected</span>
                      )}
                    </div>
                  </div>

                  {/* Expanded Permissions */}
                  {expandedMember === member.id && canManagePermissions && (
                    <div className="px-4 py-3 bg-white border-t border-gray-100">
                      <div className="flex items-center gap-2 mb-3">
                        <Shield className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-xs font-semibold text-gray-700">Workspace Permissions</span>
                        {savingPerms === member.id && (
                          <span className="text-[10px] text-blue-500 animate-pulse">Saving...</span>
                        )}
                      </div>
                      {memberPerms[member.id] ? (
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                            <label key={key} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!(memberPerms[member.id] as any)[key]}
                                onChange={() => handleTogglePermission(member.id, key)}
                                disabled={member.role === 'admin'}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-xs text-gray-700">{label}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center py-4">
                          <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Add Members Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Add Team Members</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search staff by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 text-sm bg-gray-50/50 border-gray-200"
              />
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {loading ? (
                <div className="py-8 text-center">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-gray-400">Loading organization staff...</p>
                </div>
              ) : filteredOrgMembers.length === 0 ? (
                <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-2xl">
                  <p className="text-xs text-gray-400">No available staff found</p>
                </div>
              ) : (
                filteredOrgMembers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleAddMember(user.id!)}
                    className="w-full flex items-center justify-between p-3 hover:bg-blue-50/50 border border-transparent hover:border-blue-100 rounded-xl transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white text-xs font-bold uppercase transition-transform group-hover:scale-105">
                        {user.name?.charAt(0) || '?'}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-400">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${ROLE_COLORS[user.role || ''] || 'bg-gray-100 text-gray-500'}`}>
                        {ROLE_LABELS[user.role || ''] || user.role}
                      </span>
                      <div className="w-7 h-7 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center transition-all group-hover:bg-blue-600 group-hover:text-white">
                        <Plus className="h-4 w-4" />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50/50">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}
