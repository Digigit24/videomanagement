import { useState, useEffect } from 'react';
import { userService } from '@/services/api.service';
import { User, UserRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users as UsersIcon, Plus, Trash2, Mail, Calendar, Building2 } from 'lucide-react';
import { formatDate, getApiUrl } from '@/lib/utils';
import { Toast } from '@/components/ui/toast';
import DeleteUserModal from '@/components/DeleteUserModal';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  video_editor: 'Video Editor',
  client: 'Client',
  member: 'Member',
  project_manager: 'Project Manager',
  social_media_manager: 'Social Media Manager',
  videographer: 'Videographer',
  photo_editor: 'Photo Editor',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  video_editor: 'bg-blue-100 text-blue-700 border-blue-200',
  client: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  member: 'bg-gray-100 text-gray-600 border-gray-200',
  project_manager: 'bg-amber-100 text-amber-700 border-amber-200',
  social_media_manager: 'bg-teal-100 text-teal-700 border-teal-200',
  videographer: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  photo_editor: 'bg-pink-100 text-pink-700 border-pink-200',
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await userService.getUsers();
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
  };

  const handleToggleOrgMember = async (userId: string, currentValue: boolean) => {
    try {
      const updated = await userService.toggleOrgMember(userId, !currentValue);
      setUsers(users.map(u => u.id === userId ? updated : u));
      setToast({ message: !currentValue ? 'Added as org member' : 'Removed from org members', type: 'success' });
    } catch (error) {
      setToast({ message: 'Failed to update org member status', type: 'error' });
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      const updated = await userService.changeRole(userId, newRole);
      setUsers(users.map(u => u.id === userId ? updated : u));
      setToast({ message: 'Role updated', type: 'success' });
    } catch (error) {
      setToast({ message: 'Failed to change role', type: 'error' });
    }
  };

  const getInitials = (name: string | undefined) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const currentUserId = localStorage.getItem('userId');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UsersIcon className="h-5 w-5 text-gray-600" />
          <h1 className="text-lg font-semibold text-gray-900">Team Management</h1>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{users.length} users</span>
        </div>
        <Button onClick={() => setShowAddModal(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add User
        </Button>
      </div>

      {/* Stats row */}
      <div className="flex gap-3">
        {['admin', 'video_editor', 'project_manager', 'social_media_manager', 'client', 'member'].map(role => {
          const count = users.filter(u => u.role === role).length;
          if (count === 0) return null;
          return (
            <div key={role} className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${ROLE_COLORS[role]}`}>
              {ROLE_LABELS[role]}: {count}
            </div>
          );
        })}
        <div className="text-xs px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 font-medium">
          <Building2 className="h-3 w-3 inline mr-1" />
          Org Members: {users.filter(u => u.is_org_member).length}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map(user => (
          <div key={user.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                {user.avatar_url ? (
                  <img src={getApiUrl(user.avatar_url)} alt={user.name} className="w-10 h-10 rounded-full object-cover border border-gray-100" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                    {getInitials(user.name || user.email)}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[user.role || 'member']}`}>
                    {ROLE_LABELS[user.role || 'member']}
                  </span>
                </div>
              </div>

              {user.id !== currentUserId && (
                <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(user)} className="text-red-500 hover:text-red-700 h-7 w-7 p-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <div className="space-y-1.5 text-xs text-gray-500 mb-3">
              <div className="flex items-center gap-1.5">
                <Mail className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
              {user.created_at && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 flex-shrink-0" />
                  <span>Joined {formatDate(user.created_at)}</span>
                </div>
              )}
            </div>

            {/* Org member toggle + role change */}
            <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => handleToggleOrgMember(user.id!, user.is_org_member || false)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  user.is_org_member
                    ? 'bg-orange-100 text-orange-700 border border-orange-200'
                    : 'bg-gray-50 text-gray-400 border border-gray-200 hover:bg-gray-100'
                }`}
                title={user.is_org_member ? 'Remove from organization' : 'Add to organization'}
              >
                <Building2 className="h-3 w-3" />
                {user.is_org_member ? 'Org Member' : 'Not Org'}
              </button>

              {user.id !== currentUserId && (
                <select
                  value={user.role}
                  onChange={(e) => handleRoleChange(user.id!, e.target.value as UserRole)}
                  className="flex-1 text-[11px] px-2 py-1 border border-gray-200 rounded-md bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-300"
                >
                  <option value="member">Member</option>
                  <option value="client">Client</option>
                  <option value="video_editor">Video Editor</option>
                  <option value="videographer">Videographer</option>
                  <option value="photo_editor">Photo Editor</option>
                  <option value="project_manager">Project Manager</option>
                  <option value="social_media_manager">Social Media Manager</option>
                  <option value="admin">Admin</option>
                </select>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onUserAdded={(user) => {
            setUsers([user, ...users]);
            setShowAddModal(false);
            setToast({ message: 'User added successfully', type: 'success' });
          }}
        />
      )}


      {userToDelete && (
        <DeleteUserModal
          userId={userToDelete.id!}
          userName={userToDelete.name || userToDelete.email}
          onClose={() => setUserToDelete(null)}
          onDeleted={(id) => {
            setUsers(users.filter(u => u.id !== id));
            setUserToDelete(null);
            setToast({ message: 'User moved to recycle bin', type: 'success' });
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

interface AddUserModalProps {
  onClose: () => void;
  onUserAdded: (user: User) => void;
}

function AddUserModal({ onClose, onUserAdded }: AddUserModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('member');
  const [isOrgMember, setIsOrgMember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-check org member for org roles
  useEffect(() => {
    if (['admin', 'video_editor', 'project_manager', 'social_media_manager'].includes(role)) {
      setIsOrgMember(true);
    }
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const user = await userService.createUser(name, email, password, role, isOrgMember);
      onUserAdded(user);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Add New User</h2>
          <p className="text-xs text-gray-400 mt-0.5">Create a new team member account</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="member">Member</option>
              <option value="client">Client</option>
              <option value="video_editor">Video Editor</option>
              <option value="project_manager">Project Manager</option>
              <option value="social_media_manager">Social Media Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* Organization Member Toggle */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <label className="flex items-center gap-2 cursor-pointer flex-1">
              <input
                type="checkbox"
                checked={isOrgMember}
                onChange={(e) => setIsOrgMember(e.target.checked)}
                className="w-4 h-4 text-orange-600 bg-white border-gray-300 rounded focus:ring-orange-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-orange-500" />
                  Organization Member
                </span>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Will appear in workspace member picker when creating workspaces
                </p>
              </div>
            </label>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end bg-gray-50">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating...' : 'Create User'}
          </Button>
        </div>
      </div>
    </div>
  );
}
