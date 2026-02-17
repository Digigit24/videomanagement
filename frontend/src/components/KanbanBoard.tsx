import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { Video, VideoStatus } from '@/types';
import { videoService } from '@/services/api.service';
import { formatBytes, formatDate } from '@/lib/utils';
import { FileVideo, User, Play, GripVertical, Link2, Check, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Toast } from './ui/toast';

interface KanbanBoardProps {
  videos: Video[];
  onVideoUpdate: (videoId: string, newStatus: VideoStatus) => void;
}

const statusColumns: VideoStatus[] = ['Draft', 'Pending', 'Under Review', 'Approved', 'Changes Needed', 'Rejected', 'Posted'];

const statusColors: Record<VideoStatus, string> = {
  'Draft': 'bg-slate-50 border-slate-200',
  'Pending': 'bg-amber-50 border-amber-200',
  'Under Review': 'bg-blue-50 border-blue-200',
  'Approved': 'bg-emerald-50 border-emerald-200',
  'Changes Needed': 'bg-orange-50 border-orange-200',
  'Rejected': 'bg-red-50 border-red-200',
  'Posted': 'bg-violet-50 border-violet-200',
};

const statusDotColors: Record<VideoStatus, string> = {
  'Draft': 'bg-slate-400',
  'Pending': 'bg-amber-400',
  'Under Review': 'bg-blue-400',
  'Approved': 'bg-emerald-400',
  'Changes Needed': 'bg-orange-400',
  'Rejected': 'bg-red-400',
  'Posted': 'bg-violet-400',
};

export default function KanbanBoard({ videos, onVideoUpdate }: KanbanBoardProps) {
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const navigate = useNavigate();

  const userRole = localStorage.getItem('userRole') || '';
  const canChangeStatus = ['admin', 'project_manager', 'client'].includes(userRole);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8,
    },
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 200,
      tolerance: 8,
    },
  });

  const sensors = useSensors(pointerSensor, touchSensor);

  const getVideosByStatus = (status: VideoStatus) => {
    return videos.filter(v => v.status === status);
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (!canChangeStatus) return;
    const video = videos.find(v => v.id === event.active.id);
    setActiveVideo(video || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveVideo(null);

    if (!over || !canChangeStatus) return;

    const videoId = active.id as string;
    const newStatus = over.id as VideoStatus;
    const video = videos.find(v => v.id === videoId);

    if (video && video.status !== newStatus && statusColumns.includes(newStatus)) {
      const previousStatus = video.status;

      // Optimistic update
      onVideoUpdate(videoId, newStatus);

      try {
        await videoService.updateStatus(video.id, newStatus);
        setToast({ message: `Status updated to ${newStatus}`, type: 'success' });
      } catch (error: any) {
        console.error('Failed to update status:', error);
        // Revert optimistic update
        onVideoUpdate(videoId, previousStatus);
        const errorMsg = error?.response?.data?.error || 'Failed to update status';
        setToast({ message: errorMsg, type: 'error' });
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
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1">
        {statusColumns.map(status => {
          const statusVideos = getVideosByStatus(status);

          return (
            <StatusColumn
              key={status}
              status={status}
              videos={statusVideos}
              canDrag={canChangeStatus}
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

      {!canChangeStatus && (
        <p className="text-xs text-gray-400 text-center mt-2">
          Only admin, project manager, or client can change video status by dragging
        </p>
      )}

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
  canDrag: boolean;
  onVideoClick: (id: string, bucket: string) => void;
}

function StatusColumn({ status, videos, canDrag, onVideoClick }: StatusColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  return (
    <div className="flex-shrink-0 w-64">
      <div className={`rounded-lg border ${statusColors[status]} ${isOver ? 'ring-2 ring-blue-400 shadow-md' : ''} transition-all`}>
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
              canDrag={canDrag}
              onClick={() => onVideoClick(video.id, video.bucket)}
            />
          ))}
          {videos.length === 0 && (
            <div className="text-center text-gray-300 text-xs py-8">
              {canDrag ? 'Drop videos here' : 'No videos'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DraggableVideoCardProps {
  video: Video;
  canDrag: boolean;
  onClick: () => void;
}

function KanbanThumbnail({ video }: { video: Video }) {
  const [error, setError] = useState(false);

  if (video.thumbnail_key && !error) {
    return (
      <div className="relative w-full aspect-video rounded overflow-hidden bg-gray-900 mb-2">
        <img
          src={videoService.getThumbnailUrl(video.id)}
          alt={video.filename}
          className="w-full h-full object-cover"
          onError={() => setError(true)}
        />
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow">
            <Play className="h-3.5 w-3.5 text-gray-900 ml-0.5" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video rounded overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 mb-2 flex items-center justify-center">
      <FileVideo className="h-6 w-6 text-gray-300" />
    </div>
  );
}

function KanbanCopyLinkButton({ videoId }: { videoId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'copied'>('idle');

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
      className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all ${
        state === 'copied'
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600'
      }`}
      title={state === 'copied' ? 'Link copied!' : 'Copy review link'}
    >
      {state === 'loading' ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      ) : state === 'copied' ? (
        <Check className="h-2.5 w-2.5" />
      ) : (
        <Link2 className="h-2.5 w-2.5" />
      )}
      {state === 'copied' ? 'Copied' : 'Link'}
    </button>
  );
}

function DraggableVideoCard({ video, canDrag, onClick }: DraggableVideoCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: video.id,
    disabled: !canDrag,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-sm transition-shadow group ${
        isDragging ? 'opacity-40 shadow-lg' : ''
      } ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
    >
      {/* Drag handle area */}
      {canDrag && (
        <div
          {...listeners}
          {...attributes}
          className="flex items-center justify-center py-1 bg-gray-50/50 border-b border-gray-100 cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-3 w-3 text-gray-300" />
        </div>
      )}

      <div
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="cursor-pointer p-2.5"
      >
        <KanbanThumbnail video={video} />

        <h3 className="text-xs font-medium text-gray-900 line-clamp-2 mb-1.5">{video.filename}</h3>

        <div className="flex items-center justify-between text-[10px] text-gray-400">
          <span>{formatDate(video.created_at)}</span>
          <span>{formatBytes(video.size)}</span>
        </div>

        <div className="flex items-center justify-between mt-1.5">
          {video.uploaded_by_name ? (
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
              <User className="h-2.5 w-2.5" />
              <span>{video.uploaded_by_name}</span>
            </div>
          ) : (
            <div />
          )}
          <KanbanCopyLinkButton videoId={video.id} />
        </div>
      </div>
    </div>
  );
}
