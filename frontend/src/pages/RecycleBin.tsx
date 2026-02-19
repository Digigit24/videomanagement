import { useState, useEffect } from 'react';
import { recycleBinService, videoService, workspaceService } from '@/services/api.service';
import { Workspace, User, DeletedVideo } from '@/types';
import { Button } from '@/components/ui/button';
import { RefreshCw, Trash2, User as UserIcon, Building2, FileVideo, AlertTriangle } from 'lucide-react';
import { formatDate, formatBytes } from '@/lib/utils';
import { Toast } from '@/components/ui/toast';

export default function RecycleBin() {
  const [deletedWorkspaces, setDeletedWorkspaces] = useState<Workspace[]>([]);
  const [deletedUsers, setDeletedUsers] = useState<User[]>([]);
  const [deletedVideos, setDeletedVideos] = useState<DeletedVideo[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadRecycleBin();
  }, []);

  const loadRecycleBin = async () => {
    try {
      setLoading(true);
      const data = await recycleBinService.getRecycleBin();
      setDeletedWorkspaces(data.workspaces);
      setDeletedUsers(data.users);

      // Load deleted videos from all workspaces
      const ws = await workspaceService.getWorkspaces();
      setWorkspaces(ws);
      const allDeleted: DeletedVideo[] = [];
      for (const w of ws) {
        try {
          const deleted = await videoService.getDeletedVideos(w.bucket);
          allDeleted.push(...deleted);
        } catch {}
      }
      setDeletedVideos(allDeleted);
    } catch (error) {
      console.error('Failed to load recycle bin:', error);
      setToast({ message: 'Failed to load recycle bin items', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreWorkspace = async (id: string, name: string) => {
    try {
      setRestoring(id);
      await recycleBinService.restoreWorkspace(id);
      setDeletedWorkspaces(deletedWorkspaces.filter(w => w.id !== id));
      setToast({ message: `Workspace "${name}" restored`, type: 'success' });
    } catch (error) {
      setToast({ message: `Failed to restore workspace "${name}"`, type: 'error' });
    } finally {
      setRestoring(null);
    }
  };

  const handleRestoreUser = async (id: string, name: string) => {
    try {
      setRestoring(id);
      await recycleBinService.restoreUser(id);
      setDeletedUsers(deletedUsers.filter(u => u.id !== id));
      setToast({ message: `User "${name}" restored`, type: 'success' });
    } catch (error) {
      setToast({ message: `Failed to restore user "${name}"`, type: 'error' });
    } finally {
      setRestoring(null);
    }
  };

  const handleRestoreVideo = async (id: string, filename: string) => {
    try {
      setRestoring(id);
      await videoService.restoreVideo(id);
      setDeletedVideos(deletedVideos.filter(v => v.id !== id));
      setToast({ message: `"${filename}" restored`, type: 'success' });
    } catch (error) {
      setToast({ message: `Failed to restore "${filename}"`, type: 'error' });
    } finally {
      setRestoring(null);
    }
  };

  const handlePermanentDeleteVideo = async (id: string, filename: string) => {
    if (!confirm(`Are you sure you want to PERMANENTLY delete "${filename}"? This action cannot be undone.`)) return;
    try {
      setDeleting(id);
      await videoService.permanentDeleteVideo(id);
      setDeletedVideos(deletedVideos.filter(v => v.id !== id));
      setToast({ message: `"${filename}" permanently deleted`, type: 'success' });
    } catch (error) {
      setToast({ message: `Failed to permanently delete "${filename}"`, type: 'error' });
    } finally {
      setDeleting(null);
    }
  };

  const calculateExpiry = (deletedAt: string) => {
    const deleted = new Date(deletedAt);
    const expiry = new Date(deleted.getTime() + 5 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) return 'Expired';
    if (daysLeft === 0) return 'Review pending';
    return `${daysLeft} days left`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading recycle bin...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Trash2 className="h-6 w-6 text-gray-500" />
          Recycle Bin
        </h1>
        <p className="text-gray-500 mt-1">
          Items are permanently deleted after 5 days. You can also permanently delete items manually.
        </p>
      </div>

      {/* Deleted Videos Section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FileVideo className="h-5 w-5 text-orange-500" />
          Deleted Videos & Photos ({deletedVideos.length})
        </h2>

        {deletedVideos.length === 0 ? (
          <p className="text-gray-500 text-sm italic">No deleted videos or photos</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {deletedVideos.map(video => (
              <div key={video.id} className="bg-white border border-red-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{video.filename}</h3>
                    <p className="text-xs text-gray-400">{formatBytes(video.size)} | {video.bucket}</p>
                    {video.uploaded_by_name && (
                      <p className="text-xs text-gray-400">Uploaded by: {video.uploaded_by_name}</p>
                    )}
                  </div>
                  <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0 ml-2">
                    {calculateExpiry(video.deleted_at)}
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-4 border-t border-gray-50 pt-3">
                  <div className="text-xs text-gray-400 flex-1">
                    Deleted: {formatDate(video.deleted_at)}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 h-7 text-xs"
                    onClick={() => handleRestoreVideo(video.id, video.filename)}
                    disabled={restoring === video.id}
                  >
                    <RefreshCw className={`h-3 w-3 ${restoring === video.id ? 'animate-spin' : ''}`} />
                    Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    onClick={() => handlePermanentDeleteVideo(video.id, video.filename)}
                    disabled={deleting === video.id}
                  >
                    <AlertTriangle className={`h-3 w-3 ${deleting === video.id ? 'animate-pulse' : ''}`} />
                    Delete Forever
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Workspaces Section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-500" />
          Deleted Workspaces ({deletedWorkspaces.length})
        </h2>

        {deletedWorkspaces.length === 0 ? (
          <p className="text-gray-500 text-sm italic">No deleted workspaces</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {deletedWorkspaces.map(ws => (
              <div key={ws.id} className="bg-white border border-red-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{ws.client_name}</h3>
                    <p className="text-xs text-gray-400 font-mono">{ws.bucket}</p>
                  </div>
                  <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
                    {calculateExpiry(ws.deleted_at || '')}
                  </span>
                </div>

                <div className="flex items-end justify-between mt-4 border-t border-gray-50 pt-3">
                  <div className="text-xs text-gray-400">
                    Deleted on {ws.deleted_at ? formatDate(ws.deleted_at) : 'Unknown'}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8"
                    onClick={() => handleRestoreWorkspace(ws.id, ws.client_name)}
                    disabled={restoring === ws.id}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${restoring === ws.id ? 'animate-spin' : ''}`} />
                    Restore
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Users Section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-purple-500" />
          Deleted Users ({deletedUsers.length})
        </h2>

        {deletedUsers.length === 0 ? (
          <p className="text-gray-500 text-sm italic">No deleted users</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {deletedUsers.map(user => (
              <div key={user.id} className="bg-white border border-red-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full border border-gray-100" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                        {user.name?.charAt(0)}
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm">{user.name}</h3>
                      <p className="text-xs text-gray-400">{user.email}</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
                    {calculateExpiry(user.deleted_at || '')}
                  </span>
                </div>

                <div className="flex items-end justify-between mt-2 border-t border-gray-50 pt-3">
                  <div className="text-xs text-gray-400">
                    <span className="block mb-0.5 capitalize">{user.role}</span>
                    Deleted: {user.deleted_at ? formatDate(user.deleted_at) : 'Unknown'}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8"
                    onClick={() => handleRestoreUser(user.id!, user.name!)}
                    disabled={restoring === user.id}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${restoring === user.id ? 'animate-spin' : ''}`} />
                    Restore
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
