import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { Video, VideoStatus } from '@/types';
import { videoService } from '@/services/api.service';
import { formatBytes, formatDate } from '@/lib/utils';
import { FileVideo, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Toast } from './ui/toast';

interface KanbanBoardProps {
  videos: Video[];
  onVideoUpdate: (videoId: string, newStatus: VideoStatus) => void;
}

const statusColumns: VideoStatus[] = ['Draft', 'Pending', 'Under Review', 'Approved', 'Changes Needed', 'Rejected'];

const statusColors: Record<VideoStatus, string> = {
  'Draft': 'bg-slate-50 border-slate-200',
  'Pending': 'bg-amber-50 border-amber-200',
  'Under Review': 'bg-blue-50 border-blue-200',
  'Approved': 'bg-emerald-50 border-emerald-200',
  'Changes Needed': 'bg-orange-50 border-orange-200',
  'Rejected': 'bg-red-50 border-red-200',
};

const statusDotColors: Record<VideoStatus, string> = {
  'Draft': 'bg-slate-400',
  'Pending': 'bg-amber-400',
  'Under Review': 'bg-blue-400',
  'Approved': 'bg-emerald-400',
  'Changes Needed': 'bg-orange-400',
  'Rejected': 'bg-red-400',
};

export default function KanbanBoard({ videos, onVideoUpdate }: KanbanBoardProps) {
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const navigate = useNavigate();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const getVideosByStatus = (status: VideoStatus) => {
    return videos.filter(v => v.status === status);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const video = videos.find(v => v.id === event.active.id);
    setActiveVideo(video || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveVideo(null);

    if (!over) return;

    const videoId = active.id as string;
    const newStatus = over.id as VideoStatus;
    const video = videos.find(v => v.id === videoId);

    if (video && video.status !== newStatus) {
      const previousStatus = video.status;

      onVideoUpdate(videoId, newStatus);

      try {
        await videoService.updateStatus(video.id, newStatus);
        setToast({ message: `Status updated to ${newStatus}`, type: 'success' });
      } catch (error) {
        console.error('Failed to update status:', error);
        onVideoUpdate(videoId, previousStatus);
        setToast({ message: 'Failed to update status', type: 'error' });
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {statusColumns.map(status => {
          const statusVideos = getVideosByStatus(status);

          return (
            <StatusColumn
              key={status}
              status={status}
              videos={statusVideos}
              onVideoClick={(id, bucket) => navigate(`/workspace/${bucket}/video/${id}`)}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeVideo && (
          <div className="bg-white border-2 border-blue-400 rounded-lg p-3 shadow-lg w-64 opacity-90">
            <div className="flex items-start gap-2">
              <FileVideo className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <h3 className="text-sm font-medium line-clamp-2">{activeVideo.filename}</h3>
            </div>
          </div>
        )}
      </DragOverlay>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </DndContext>
  );
}

interface StatusColumnProps {
  status: VideoStatus;
  videos: Video[];
  onVideoClick: (id: string, bucket: string) => void;
}

function StatusColumn({ status, videos, onVideoClick }: StatusColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  return (
    <div className="flex-shrink-0 w-64">
      <div className={`rounded-lg border ${statusColors[status]} ${isOver ? 'ring-2 ring-blue-400' : ''}`}>
        <div className="px-3 py-2.5 border-b border-gray-200/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusDotColors[status]}`} />
              <span className="text-xs font-semibold text-gray-700">{status}</span>
            </div>
            <span className="text-xs text-gray-400 bg-white/60 px-1.5 py-0.5 rounded">
              {videos.length}
            </span>
          </div>
        </div>
        <div ref={setNodeRef} className="p-2 space-y-2 min-h-[400px]">
          {videos.map(video => (
            <DraggableVideoCard
              key={video.id}
              video={video}
              onClick={() => onVideoClick(video.id, video.bucket)}
            />
          ))}
          {videos.length === 0 && (
            <div className="text-center text-gray-300 text-xs py-8">
              Drop videos here
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DraggableVideoCardProps {
  video: Video;
  onClick: () => void;
}

function DraggableVideoCard({ video, onClick }: DraggableVideoCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: video.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bg-white border border-gray-200 rounded-lg p-3 cursor-move hover:shadow-sm transition-shadow ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="cursor-pointer"
      >
        <div className="flex items-start gap-2 mb-2">
          <FileVideo className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
          <h3 className="text-xs font-medium text-gray-900 line-clamp-2 flex-1">{video.filename}</h3>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{formatDate(video.created_at)}</span>
          <span>{formatBytes(video.size)}</span>
        </div>

        {video.uploaded_by_name && (
          <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
            <User className="h-3 w-3" />
            <span>{video.uploaded_by_name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
