import { useState, useEffect } from 'react';
import { videoService } from '@/services/api.service';
import { Video } from '@/types';
import { formatBytes, formatDate } from '@/lib/utils';
import { History, ChevronDown, ChevronUp, Clock, User, Check } from 'lucide-react';

interface VersionHistoryProps {
  videoId: string;
  bucket: string;
  currentVersionId: string;
  onVersionSelect: (videoId: string) => void;
}

export default function VersionHistory({ videoId, bucket, currentVersionId, onVersionSelect }: VersionHistoryProps) {
  const [versions, setVersions] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (expanded && versions.length === 0) {
      loadVersions();
    }
  }, [expanded, videoId]);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const data = await videoService.getVersionHistory(videoId, bucket);
      setVersions(data.versions);
    } catch (error) {
      console.error('Failed to load version history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <History className="h-4 w-4" />
        <span>Version History</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(false)}
        className="flex items-center justify-between w-full px-4 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <History className="h-4 w-4" />
          <span>Version History</span>
          {versions.length > 0 && (
            <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
              {versions.length} version{versions.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
      </button>

      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : versions.length <= 1 ? (
          <div className="px-4 py-6 text-center text-sm text-gray-400">
            No previous versions
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {versions.map((version) => {
              const isCurrent = version.id === currentVersionId;

              return (
                <button
                  key={version.id}
                  onClick={() => !isCurrent && onVersionSelect(version.id)}
                  className={`w-full px-4 py-3 flex items-start gap-3 text-left transition-colors ${
                    isCurrent
                      ? 'bg-blue-50 border-l-2 border-blue-500'
                      : 'hover:bg-gray-50 border-l-2 border-transparent'
                  }`}
                >
                  <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    isCurrent
                      ? 'bg-blue-500 text-white'
                      : version.is_active_version
                        ? 'bg-emerald-500 text-white'
                        : 'bg-gray-200 text-gray-600'
                  }`}>
                    {isCurrent ? <Check className="h-3.5 w-3.5" /> : `v${version.version_number}`}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${isCurrent ? 'text-blue-700' : 'text-gray-800'}`}>
                        Version {version.version_number}
                      </p>
                      {isCurrent && (
                        <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                          Current
                        </span>
                      )}
                      {version.is_active_version && !isCurrent && (
                        <span className="text-xs bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-medium">
                          Active
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(version.created_at)}
                      </span>
                      <span>{formatBytes(version.size)}</span>
                      {version.uploaded_by_name && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {version.uploaded_by_name}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
