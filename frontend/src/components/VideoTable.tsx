import { useState, useRef, useEffect } from 'react';
import { Video, VideoStatus } from '@/types';
import { formatBytes, formatDate } from '@/lib/utils';
import { videoService } from '@/services/api.service';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { FileVideo, Search, User, Calendar, Play, Link2, Check, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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

  // On hover, play video preview for videos without thumbnails
  useEffect(() => {
    if (hovering && videoRef.current && !video.thumbnail_key) {
      videoRef.current.play().catch(() => {});
    } else if (!hovering && videoRef.current) {
      videoRef.current.pause();
      if (videoRef.current.currentTime > 0) videoRef.current.currentTime = 0;
    }
  }, [hovering, video.thumbnail_key]);

  if (video.thumbnail_key && !error) {
    return (
      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-gray-900 mb-3">
        <img
          src={videoService.getThumbnailUrl(video.id)}
          alt={video.filename}
          className="w-full h-full object-cover"
          onError={() => setError(true)}
        />
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <Play className="h-5 w-5 text-gray-900 ml-0.5" />
          </div>
        </div>
        <span className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold rounded-full ${statusColors[video.status]}`}>
          {video.status}
        </span>
      </div>
    );
  }

  // Fallback: show video preview on hover, or a styled placeholder
  const streamUrl = videoService.getStreamUrl(video.id, video.bucket);
  return (
    <div
      className="relative w-full aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900 mb-3"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <video
        ref={videoRef}
        src={streamUrl}
        muted
        playsInline
        preload="metadata"
        className="w-full h-full object-cover"
      />
      {!hovering && (
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

function CopyLinkButton({ videoId }: { videoId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'copied'>('idle');

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigating to video detail
    if (state === 'loading' || state === 'copied') return;

    setState('loading');
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
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
      setState('idle');
    }
  };

  return (
    <button
      onClick={handleCopyLink}
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
        state === 'copied'
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-600 active:bg-blue-200'
      }`}
      title={state === 'copied' ? 'Link copied!' : 'Copy review link'}
    >
      {state === 'loading' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : state === 'copied' ? (
        <Check className="h-3 w-3" />
      ) : (
        <Link2 className="h-3 w-3" />
      )}
      {state === 'copied' ? 'Copied!' : 'Link'}
    </button>
  );
}

export default function VideoTable({ videos }: VideoTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const navigate = useNavigate();

  const filteredVideos = videos.filter((video) => {
    const matchesSearch = video.filename.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || video.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-300" />
          <Input
            placeholder="Search videos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9 text-sm border-gray-200"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9 text-sm border-gray-200">
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
      </div>

      {/* Video Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filteredVideos.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <FileVideo className="h-10 w-10 mx-auto mb-2 text-gray-200" />
            <p className="text-sm text-gray-400">No videos found</p>
          </div>
        ) : (
          filteredVideos.map((video) => (
            <div
              key={video.id}
              onClick={() => navigate(`/workspace/${video.bucket}/video/${video.id}`)}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="p-3">
                <VideoThumbnail video={video} />

                <h3 className="text-sm font-medium text-gray-900 truncate mb-1">{video.filename}</h3>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(video.created_at)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-gray-400">{formatBytes(video.size)}</span>
                      <span className="text-[9px] text-gray-300 font-mono" title={video.id}>ID: {video.id.slice(0, 8)}...</span>
                    </div>
                  </div>

                <div className="flex items-center justify-between mt-1.5">
                  {video.uploaded_by_name ? (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <User className="h-3 w-3" />
                      <span>{video.uploaded_by_name}</span>
                    </div>
                  ) : (
                    <div />
                  )}
                  <CopyLinkButton videoId={video.id} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
