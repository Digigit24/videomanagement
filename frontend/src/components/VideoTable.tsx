import { useState } from 'react';
import { Video, VideoStatus } from '@/types';
import { formatBytes, formatDate } from '@/lib/utils';
import { videoService } from '@/services/api.service';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { FileVideo, Search, User, Calendar, Play } from 'lucide-react';
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

  return (
    <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 mb-3 flex items-center justify-center">
      <FileVideo className="h-10 w-10 text-gray-300" />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
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
                  <span className="text-[10px] text-gray-400">{formatBytes(video.size)}</span>
                </div>

                {video.uploaded_by_name && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-400">
                    <User className="h-3 w-3" />
                    <span>{video.uploaded_by_name}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
