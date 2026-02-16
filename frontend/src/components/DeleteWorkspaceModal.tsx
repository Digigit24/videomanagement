import { useState } from 'react';
import { workspaceService } from '@/services/api.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, AlertTriangle } from 'lucide-react';

interface DeleteWorkspaceModalProps {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

export default function DeleteWorkspaceModal({ workspaceId, workspaceName, onClose, onDeleted }: DeleteWorkspaceModalProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError('');

    try {
      await workspaceService.deleteWorkspace(workspaceId, password);
      onDeleted(workspaceId);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Delete Workspace
          </h3>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <strong>{workspaceName}</strong>? This action cannot be undone.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Confirm Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="new-password"
              required
              className="h-9 text-sm"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="destructive" size="sm" disabled={loading || !password}>
              {loading ? 'Deleting...' : 'Delete Workspace'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
