import { useState } from 'react';
import { Video, VideoStatus } from '@/types';
import { formatBytes, formatDate } from '@/lib/utils';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { FileVideo, Search, User, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface VideoTableProps {
  videos: Video[];
}

const statusColors: Record<VideoStatus, string> = {
  'Pending': 'bg-amber-100 text-amber-800',
  'Under Review': 'bg-blue-100 text-blue-800',
  'Approved': 'bg-emerald-100 text-emerald-800',
  'Changes Needed': 'bg-orange-100 text-orange-800',
  'Rejected': 'bg-red-100 text-red-800',
};

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
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Under Review">Under Review</SelectItem>
            <SelectItem value="Approved">Approved</SelectItem>
            <SelectItem value="Changes Needed">Changes Needed</SelectItem>
            <SelectItem value="Rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Video Chips Grid */}
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
              onClick={() => navigate(`/video/${video.id}`)}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer group"
            >
              {/* Video icon + filename */}
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 transition-colors">
                  <FileVideo className="h-5 w-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-gray-900 truncate">{video.filename}</h3>
                  <p className="text-xs text-gray-400">{formatBytes(video.size)}</p>
                </div>
              </div>

              {/* Meta row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(video.created_at)}</span>
                </div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[video.status]}`}>
                  {video.status}
                </span>
              </div>

              {video.uploaded_by_name && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                  <User className="h-3 w-3" />
                  <span>{video.uploaded_by_name}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
