import { useState, useRef, useEffect } from 'react';
import { Video, VideoStatus } from '@/types';
import { formatBytes, formatDate } from '@/lib/utils';
import { videoService } from '@/services/api.service';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { FileVideo, Search, User, Calendar, Play, Link2, Check, Loader2, Download, Share2, CheckSquare, Square, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

interface VideoTableProps {
  videos: Video[];
}

const statusColors: Record<VideoStatus, string> = {
  'Draft': 'bg-slate-100 text-slate-700',
  'Pending': 'bg-amber-100 text-amber-800',
  'Under Review': 'bg-blue-100 text-blue-800',
  'Approved': 'bg-emerald-100 text-emerald-800',
  'Changes Needed': 'bg-orange-100 text-orange-800',
  'Rejected': 'bg-red-100 text-red-800',
  'Posted': 'bg-violet-100 text-violet-800',
};

function VideoThumbnail({ video }: { video: Video }) {
  const [error, setError] = useState(false);
  const [hovering, setHovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isPhoto = (video.media_type || 'video') === 'photo';

  useEffect(() => {
    if (isPhoto) return;
    if (hovering && videoRef.current && !video.thumbnail_key) {
      videoRef.current.play().catch(() => {});
    } else if (!hovering && videoRef.current) {
      videoRef.current.pause();
      if (videoRef.current.currentTime > 0) videoRef.current.currentTime = 0;
    }
  }, [hovering, video.thumbnail_key, isPhoto]);

  const isProcessing = !isPhoto && !video.hls_ready && video.processing_status && video.processing_status !== 'completed';
  const processingOverlay = isProcessing ? (
    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-[1]">
      {video.processing_status === 'queued' ? (
        <>
          <div className="w-6 h-6 rounded-full bg-amber-500/30 flex items-center justify-center mb-1.5">
            <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-[10px] text-amber-300 font-medium">In Queue</span>
        </>
      ) : video.processing_status === 'failed' ? (
        <>
          <div className="w-6 h-6 rounded-full bg-red-500/30 flex items-center justify-center mb-1.5">
            <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <span className="text-[10px] text-red-400 font-medium">Failed</span>
        </>
      ) : (
        <>
          <Loader2 className="h-5 w-5 text-blue-400 animate-spin mb-1.5" />
          <span className="text-[10px] text-blue-300 font-medium">
            {video.processing_progress > 0 ? `${video.processing_progress}%` : 'Processing'}
          </span>
          {video.processing_progress > 0 && (
            <div className="w-16 bg-gray-700 rounded-full h-1 mt-1 overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full transition-all duration-500" style={{ width: `${video.processing_progress}%` }} />
            </div>
          )}
        </>
      )}
    </div>
  ) : null;

  if (isPhoto) {
    return (
      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-gray-100 mb-3">
        <img
          src={videoService.getPhotoUrl(video.id)}
          alt={video.filename}
          className="w-full h-full object-cover"
          onError={() => setError(true)}
        />
        <span className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold rounded-full ${statusColors[video.status]}`}>
          {video.status}
        </span>
      </div>
    );
  }

  if (video.thumbnail_key && !error) {
    return (
      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-gray-900 mb-3">
        <img
          src={videoService.getThumbnailUrl(video.id)}
          alt={video.filename}
          className="w-full h-full object-cover"
          onError={() => setError(true)}
        />
        {processingOverlay}
        {!isProcessing && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <Play className="h-5 w-5 text-gray-900 ml-0.5" />
            </div>
          </div>
        )}
        <span className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold rounded-full ${statusColors[video.status]}`}>
          {video.status}
        </span>
      </div>
    );
  }

  const streamUrl = videoService.getStreamUrl(video.id, video.bucket);
  return (
    <div
      className="relative w-full aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900 mb-3"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {!isProcessing && (
        <video
          ref={videoRef}
          src={streamUrl}
          muted
          playsInline
          preload="metadata"
          className="w-full h-full object-cover"
        />
      )}
      {processingOverlay}
      {!isProcessing && !hovering && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <Play className="h-5 w-5 text-gray-900 ml-0.5" />
            </div>
            <span className="text-[9px] text-white/70 font-medium">Hover to preview</span>
          </div>
        </div>
      )}
      <span className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold rounded-full ${statusColors[video.status]}`}>
        {video.status}
      </span>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, loading, variant = 'default' }: {
  icon: any;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  loading?: boolean;
  variant?: 'default' | 'success';
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
        variant === 'success'
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-600 active:bg-blue-200'
      } disabled:opacity-50`}
      title={label}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
      {label}
    </button>
  );
}

export default function VideoTable({ videos }: VideoTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipDownloading, setZipDownloading] = useState(false);
  const [copyStates, setCopyStates] = useState<Record<string, 'idle' | 'loading' | 'copied'>>({});
  const navigate = useNavigate();
  const { bucket } = useParams<{ bucket: string }>();

  const filteredVideos = videos.filter((video) => {
    const matchesSearch = video.filename.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || video.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const allSelected = filteredVideos.length > 0 && filteredVideos.every(v => selected.has(v.id));

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredVideos.map(v => v.id)));
    }
  };

  const handleDownloadSingle = (video: Video, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bucket) return;
    const url = videoService.getDownloadUrl(video.id, bucket);
    window.open(url, '_blank');
  };

  const handleShareSingle = async (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (copyStates[videoId] === 'loading' || copyStates[videoId] === 'copied') return;
    setCopyStates(prev => ({ ...prev, [videoId]: 'loading' }));
    try {
      const token = await videoService.getShareToken(videoId);
      const reviewUrl = `${window.location.origin}/v/${videoId}/review?token=${token}`;
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(reviewUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = reviewUrl;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopyStates(prev => ({ ...prev, [videoId]: 'copied' }));
      setTimeout(() => setCopyStates(prev => ({ ...prev, [videoId]: 'idle' })), 2000);
    } catch {
      setCopyStates(prev => ({ ...prev, [videoId]: 'idle' }));
    }
  };

  const handleZipDownload = async () => {
    if (selected.size === 0 || !bucket) return;
    setZipDownloading(true);
    try {
      await videoService.downloadZip(Array.from(selected), bucket);
    } catch (err) {
      console.error('Zip download failed:', err);
    } finally {
      setZipDownloading(false);
    }
  };

  const handleDownloadAll = async () => {
    if (!bucket) return;
    setZipDownloading(true);
    try {
      await videoService.downloadZip(filteredVideos.map(v => v.id), bucket);
    } catch (err) {
      console.error('Zip download failed:', err);
    } finally {
      setZipDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search + Filter + Bulk Actions */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-300" />
          <Input
            placeholder="Search media..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9 text-sm border-gray-200"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm border-gray-200">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Under Review">Under Review</SelectItem>
            <SelectItem value="Approved">Approved</SelectItem>
            <SelectItem value="Changes Needed">Changes Needed</SelectItem>
            <SelectItem value="Rejected">Rejected</SelectItem>
            <SelectItem value="Posted">Posted</SelectItem>
          </SelectContent>
        </Select>

        {/* Select All toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleSelectAll}
          className="h-9 text-xs gap-1.5"
        >
          {allSelected ? <CheckSquare className="h-3.5 w-3.5 text-blue-600" /> : <Square className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{allSelected ? 'Deselect All' : 'Select All'}</span>
        </Button>

        {/* Download all as zip */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadAll}
          disabled={zipDownloading || filteredVideos.length === 0}
          className="h-9 text-xs gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
        >
          <Download className={`h-3.5 w-3.5 ${zipDownloading ? 'animate-bounce' : ''}`} />
          <span className="hidden sm:inline">Download All (.zip)</span>
        </Button>
      </div>

      {/* Bulk Selection Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 animate-fade-in">
          <span className="text-xs font-semibold text-blue-700">{selected.size} selected</span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            onClick={handleZipDownload}
            disabled={zipDownloading}
            className="h-7 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
          >
            <Download className={`h-3 w-3 ${zipDownloading ? 'animate-bounce' : ''}`} />
            {zipDownloading ? 'Creating zip...' : 'Download Selected (.zip)'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
            className="h-7 text-xs gap-1 text-gray-500"
          >
            <X className="h-3 w-3" />
            Clear
          </Button>
        </div>
      )}

      {/* Video Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filteredVideos.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <FileVideo className="h-10 w-10 mx-auto mb-2 text-gray-200" />
            <p className="text-sm text-gray-400">No media found</p>
          </div>
        ) : (
          filteredVideos.map((video) => {
            const isSelected = selected.has(video.id);
            const copyState = copyStates[video.id] || 'idle';

            return (
              <div
                key={video.id}
                onClick={() => navigate(`/workspace/${video.bucket}/video/${video.id}`)}
                className={`bg-white border rounded-xl overflow-hidden hover:shadow-md transition-all cursor-pointer group relative ${
                  isSelected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Selection checkbox */}
                <button
                  onClick={(e) => toggleSelect(video.id, e)}
                  className="absolute top-2 left-2 z-[2] w-6 h-6 rounded-md bg-white/90 border border-gray-300 flex items-center justify-center shadow-sm hover:border-blue-400 transition-colors"
                >
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5 text-blue-600" />
                  ) : (
                    <span className="w-3.5 h-3.5" />
                  )}
                </button>

                <div className="p-3">
                  <VideoThumbnail video={video} />

                  <div className="flex items-center gap-1.5 mb-1">
                    <h3 className="text-sm font-medium text-gray-900 truncate flex-1">{video.filename}</h3>
                    {(video.media_type || 'video') === 'photo' && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-pink-100 text-pink-700 rounded font-bold uppercase flex-shrink-0">Photo</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(video.created_at)}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">{formatBytes(video.size)}</span>
                  </div>

                  {/* Action buttons row */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    {video.uploaded_by_name ? (
                      <div className="flex items-center gap-1 text-[10px] text-gray-400 min-w-0">
                        <User className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{video.uploaded_by_name}</span>
                      </div>
                    ) : (
                      <div />
                    )}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <ActionButton
                        icon={Download}
                        label="Download"
                        onClick={(e) => handleDownloadSingle(video, e)}
                      />
                      <ActionButton
                        icon={copyState === 'copied' ? Check : Link2}
                        label={copyState === 'copied' ? 'Copied!' : 'Share'}
                        onClick={(e) => handleShareSingle(video.id, e)}
                        loading={copyState === 'loading'}
                        variant={copyState === 'copied' ? 'success' : 'default'}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
