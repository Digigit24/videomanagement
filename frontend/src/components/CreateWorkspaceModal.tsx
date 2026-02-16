import { useState, useEffect, useRef } from 'react';
import { workspaceService, userService } from '@/services/api.service';
import { User } from '@/types';
import { X, Users, Plus, Check, Image } from 'lucide-react';

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  project_manager: 'Project Manager',
  social_media_manager: 'Social Media Manager',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  editor: 'bg-blue-100 text-blue-700',
  project_manager: 'bg-amber-100 text-amber-700',
  social_media_manager: 'bg-emerald-100 text-emerald-700',
};

export default function CreateWorkspaceModal({ isOpen, onClose, onCreated }: CreateWorkspaceModalProps) {
  const [clientName, setClientName] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [orgMembers, setOrgMembers] = useState<User[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadOrgMembers();
    } else {
      // Reset form
      setClientName('');
      setLogoFile(null);
      setLogoPreview(null);
      setSelectedMembers([]);
      setError('');
    }
  }, [isOpen]);

  const loadOrgMembers = async () => {
    setLoadingMembers(true);
    try {
      const members = await userService.getOrgMembers();
      setOrgMembers(members);
    } catch (err) {
      console.error('Failed to load org members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const toggleMember = (memberId: string) => {
    setSelectedMembers(prev =>
      prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      setError('Client name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const workspace = await workspaceService.createWorkspace(clientName.trim(), selectedMembers);

      // Upload logo if selected
      if (logoFile && workspace.id) {
        await workspaceService.uploadLogo(workspace.id, logoFile);
      }

      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Create Client Workspace</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {/* Client Logo */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Client Logo</label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 flex items-center justify-center overflow-hidden transition-colors"
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                ) : (
                  <Image className="h-6 w-6 text-gray-400" />
                )}
              </button>
              <div className="text-xs text-gray-400">
                <p>Upload client logo or image</p>
                <p>PNG, JPG up to 5MB</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Client Name */}
          <div className="space-y-2">
            <label htmlFor="clientName" className="text-sm font-medium text-gray-700">
              Client Name *
            </label>
            <input
              id="clientName"
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Acme Corporation"
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
              required
            />
            {clientName && (
              <p className="text-xs text-gray-400">
                Bucket: <code className="bg-gray-100 px-1 py-0.5 rounded">
                  {clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 63)}
                </code>
              </p>
            )}
          </div>

          {/* Organization Members */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Add Organization Members
            </label>
            <p className="text-xs text-gray-400">
              These team members will have access to this workspace
            </p>

            {loadingMembers ? (
              <div className="flex items-center gap-2 py-4">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                <span className="text-xs text-gray-400">Loading members...</span>
              </div>
            ) : orgMembers.length === 0 ? (
              <div className="text-xs text-gray-400 py-4 text-center">
                No organization members found
              </div>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                {orgMembers.map((member) => {
                  const isSelected = selectedMembers.includes(member.id!);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleMember(member.id!)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors ${
                        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-blue-500 text-white' : 'border-2 border-gray-300'
                      }`}>
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>

                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium">
                          {member.name?.charAt(0).toUpperCase() || '?'}
                        </div>
                      )}

                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-medium text-gray-800 truncate">{member.name}</p>
                        <p className="text-xs text-gray-400 truncate">{member.email}</p>
                      </div>

                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[member.role || 'member'] || 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABELS[member.role || 'member'] || member.role}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !clientName.trim()}
            className="px-4 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Create Workspace
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
