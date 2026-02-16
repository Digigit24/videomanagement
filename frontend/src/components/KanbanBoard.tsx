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
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { formatBytes, formatDate } from '@/lib/utils';
import { FileVideo, User, Calendar, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Toast } from './ui/toast';

interface KanbanBoardProps {
  videos: Video[];
  onVideoUpdate: (videoId: string, newStatus: VideoStatus) => void;
}

const statusColumns: VideoStatus[] = ['Draft', 'In Review', 'Approved', 'Published', 'Archived'];

const statusColors: Record<VideoStatus, string> = {
  'Draft': 'bg-gray-100 border-gray-300',
  'In Review': 'bg-yellow-50 border-yellow-300',
  'Approved': 'bg-blue-50 border-blue-300',
  'Published': 'bg-green-50 border-green-300',
  'Archived': 'bg-red-50 border-red-300',
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

      // Optimistic update - immediately update UI
      onVideoUpdate(videoId, newStatus);

      // Background API call
      try {
        await videoService.updateStatus(video.id, newStatus);
        setToast({ message: `Status updated to ${newStatus}`, type: 'success' });
      } catch (error) {
        console.error('Failed to update status:', error);
        // Revert on error
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
      <div className="flex gap-4 overflow-x-auto pb-4">
        {statusColumns.map(status => {
          const statusVideos = getVideosByStatus(status);

          return (
            <StatusColumn
              key={status}
              status={status}
              videos={statusVideos}
              onVideoClick={(id) => navigate(`/video/${id}`)}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeVideo && (
          <div className="bg-white border-2 border-blue-500 rounded-lg p-3 shadow-lg w-80">
            <div className="flex items-start gap-2 mb-2">
              <FileVideo className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <h3 className="text-sm font-medium line-clamp-2 flex-1">{activeVideo.filename}</h3>
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
  onVideoClick: (id: string) => void;
}

function StatusColumn({ status, videos, onVideoClick }: StatusColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  return (
    <div className="flex-shrink-0 w-80">
      <Card className={`${statusColors[status]} border-2 ${isOver ? 'ring-2 ring-blue-500' : ''}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>{status}</span>
            <span className="text-xs bg-white px-2 py-1 rounded-full">
              {videos.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={setNodeRef} className="space-y-2 min-h-[500px]">
            {videos.map(video => (
              <DraggableVideoCard
                key={video.id}
                video={video}
                onClick={() => onVideoClick(video.id)}
              />
            ))}
            {videos.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-8">
                Drop videos here
              </div>
            )}
          </div>
        </CardContent>
      </Card>
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
      className={`bg-white border border-gray-200 rounded-lg p-3 cursor-move hover:shadow-md transition-shadow ${
        isDragging ? 'opacity-50' : ''
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
          <FileVideo className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <h3 className="text-sm font-medium line-clamp-2 flex-1">{video.filename}</h3>
        </div>

        <div className="space-y-1 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(video.created_at)}</span>
          </div>

          {video.uploaded_by_name && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span>{video.uploaded_by_name}</span>
            </div>
          )}

          <div className="text-xs text-gray-400">
            {formatBytes(video.size)}
          </div>
        </div>
      </div>
    </div>
  );
}
