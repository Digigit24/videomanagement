import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FolderOpen, Play, Image, Lock } from 'lucide-react';
import api, { API_BASE_URL } from '@/lib/api';

interface SharedVideo {
  id: string;
  filename: string;
  media_type: string;
  size: number;
  status: string;
  hls_ready: boolean;
  created_at: string;
  thumbnail_key: string | null;
}

export default function SharedFolder() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [folder, setFolder] = useState<{ id: string; name: string } | null>(null);
  const [videos, setVideos] = useState<SharedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [_requireLogin, setRequireLogin] = useState(false);

  useEffect(() => {
    if (!token) return;
    loadSharedFolder();
  }, [token]);

  const loadSharedFolder = async () => {
    try {
      const { data } = await api.get(`/public/folder/${token}`);
      setFolder(data.folder);
      setVideos(data.videos);
      setRequireLogin(data.requireLogin);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'This link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <Lock className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <FolderOpen className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-900">{folder?.name}</h1>
            <p className="text-[11px] text-gray-400">{videos.length} item{videos.length !== 1 ? 's' : ''} shared with you</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {videos.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">This folder is empty</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {videos.map((video) => (
              <button
                key={video.id}
                onClick={() => navigate(`/v/${video.id}?token=${token}&folder=1`)}
                className="bg-white border border-gray-100 rounded-xl overflow-hidden text-left hover:border-gray-200 hover:shadow-md transition-all group"
              >
                {/* Thumbnail */}
                {video.thumbnail_key ? (
                  <div className="aspect-video bg-gray-100 relative overflow-hidden">
                    <img
                      src={`${API_BASE_URL}/public/video/${video.id}/thumbnail?token=${token}`}
                      alt={video.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {(video.media_type || 'video') !== 'photo' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="h-5 w-5 text-gray-900 ml-0.5" />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-video bg-gray-50 flex items-center justify-center">
                    {(video.media_type || 'video') === 'photo' ? (
                      <Image className="h-8 w-8 text-gray-300" />
                    ) : (
                      <Play className="h-8 w-8 text-gray-300" />
                    )}
                  </div>
                )}
                <div className="p-3">
                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                    {video.filename}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {(video.media_type || 'video') === 'photo' ? 'Photo' : 'Video'}
                    {' \u00b7 '}
                    {new Date(video.created_at).toLocaleDateString()}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 pt-6 border-t border-gray-100">
          <p className="text-[11px] text-gray-400">
            Shared via <span className="font-medium text-gray-500">Digitech Solutions</span>
          </p>
        </div>
      </div>
    </div>
  );
}
