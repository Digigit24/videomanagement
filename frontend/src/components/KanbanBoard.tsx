import { useState, useRef, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { Video, VideoStatus } from '@/types';
import { videoService } from '@/services/api.service';
import { formatBytes, formatDate, buildVideoDetailPath } from '@/lib/utils';
import { FileVideo, User, Play, GripVertical, Link2, Check, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Toast } from './ui/toast';

interface KanbanBoardProps {
  videos: Video[];
  onVideoUpdate: (videoId: string, newStatus: VideoStatus) => void;
  /** Folder the board is currently showing, carried into the video detail page. */
  folderId?: string | null;
  /** Selection mode shared with the workspace toolbar (List view uses the same state). */
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (videoId: string) => void;
}

const statusColumns: VideoStatus[] = ['Draft', 'Pending', 'Under Review', 'Approved', 'Changes Needed', 'Rejected', 'Posted'];

const statusColors: Record<VideoStatus, string> = {
  'Draft': 'bg-slate-50 border-slate-200 dark:bg-slate-900/30 dark:border-slate-700',
  'Pending': 'bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-700',
  'Under Review': 'bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-blue-700',
  'Approved': 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-700',
  'Changes Needed': 'bg-orange-50 border-orange-200 dark:bg-orange-900/30 dark:border-orange-700',
  'Rejected': 'bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-700',
  'Posted': 'bg-violet-50 border-violet-200 dark:bg-violet-900/30 dark:border-violet-700',
};

// Opaque header backgrounds so cards can never show through the sticky header.
// Light shades match the column background exactly; dark shades are the solid
// equivalent of the column's translucent dark tint.
const statusHeaderColors: Record<VideoStatus, string> = {
  'Draft': 'bg-slate-50 dark:bg-slate-900',
  'Pending': 'bg-amber-50 dark:bg-amber-950',
  'Under Review': 'bg-blue-50 dark:bg-blue-950',
  'Approved': 'bg-emerald-50 dark:bg-emerald-950',
  'Changes Needed': 'bg-orange-50 dark:bg-orange-950',
  'Rejected': 'bg-red-50 dark:bg-red-950',
  'Posted': 'bg-violet-50 dark:bg-violet-950',
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

// Height of the sticky application header (Header.tsx uses h-14 = 56px).
const APP_HEADER_HEIGHT = 56;

/**
 * Lets the board use the full viewport width even though it is rendered inside
 * the centered `max-w-7xl` <main> container. We measure
 * `document.documentElement.clientWidth` (which EXCLUDES the vertical
 * scrollbar) instead of using `100vw`, so breaking out never introduces a
 * horizontal scrollbar. No transform/scale is used, so @dnd-kit pointer
 * coordinates stay accurate.
 */
function useFullBleedStyle(): React.CSSProperties | undefined {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setWidth(document.documentElement.clientWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (width === null) return undefined;
  return { width: `${width}px`, marginLeft: `calc(50% - ${width / 2}px)` };
}

export default function KanbanBoard({
  videos,
  onVideoUpdate,
  folderId = null,
  selectMode = false,
  selectedIds,
  onToggleSelect,
}: KanbanBoardProps) {
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const fullBleedStyle = useFullBleedStyle();

  const userRole = localStorage.getItem('userRole') || 'member';
  const canChangeStatus = ['admin', 'project_manager', 'client'].includes(userRole);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 5,
    },
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 250,
      tolerance: 5,
    },
  });

  const sensors = useSensors(pointerSensor, touchSensor);

  const getVideosByStatus = (status: VideoStatus) => {
    return videos.filter(v => v.status === status);
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (!canChangeStatus || selectMode) return;
    const video = videos.find(v => v.id === event.active.id);
    setActiveVideo(video || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveVideo(null);

    if (!over || !canChangeStatus || selectMode) return;

    const videoId = active.id as string;
    const newStatus = over.id as VideoStatus;
    const video = videos.find(v => v.id === videoId);

    if (!video || video.status === newStatus || !statusColumns.includes(newStatus)) return;
    if (updatingIds.has(videoId)) return;

    const previousStatus = video.status;

    onVideoUpdate(videoId, newStatus);
    setUpdatingIds(prev => new Set(prev).add(videoId));

    try {
      await videoService.updateStatus(video.id, newStatus);
      setToast({ message: `Moved to "${newStatus}"`, type: 'success' });
    } catch (error: unknown) {
      console.error('Failed to update status:', error);
      onVideoUpdate(videoId, previousStatus);
      const errorMsg = (error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to update status';
      setToast({ message: errorMsg, type: 'error' });
    } finally {
      setUpdatingIds(prev => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Full-bleed wrapper: board view only, List/Calendar are untouched */}
      <div style={fullBleedStyle} className="px-3 sm:px-6 lg:px-8">
        {/*
          Below xl the board keeps its horizontal scroll (columns stay readable).
          From xl up, overflow is visible so `position: sticky` column headers
          resolve against the page scroll instead of this box.
        */}
        <div className="overflow-x-auto xl:overflow-x-visible pb-4">
          <div className="grid grid-cols-7 gap-3 xl:gap-2 min-w-[1600px] xl:min-w-0 min-h-[500px]">
            {statusColumns.map(status => (
              <StatusColumn
                key={status}
                status={status}
                videos={getVideosByStatus(status)}
                canDrag={canChangeStatus && !selectMode}
                activeVideoId={activeVideo?.id ?? null}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onVideoClick={(id, bucket) => {
                  const origin = { bucket, folderId, view: 'kanban' };
                  navigate(buildVideoDetailPath(bucket, id, origin), { state: { from: origin } });
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeVideo && (
          <div className="bg-white dark:bg-gray-900 border-2 border-blue-400 rounded-lg p-3 shadow-xl w-56 sm:w-64 rotate-[2deg]">
            <div className="flex items-start gap-2">
              <FileVideo className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h3 className="text-sm font-medium dark:text-gray-100 line-clamp-2 break-words [overflow-wrap:anywhere]">{activeVideo.filename}</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">{activeVideo.status}</p>
              </div>
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
  activeVideoId: string | null;
  onVideoClick: (id: string, bucket: string) => void;
  selectMode: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (videoId: string) => void;
}

function StatusColumn({
  status,
  videos,
  canDrag,
  activeVideoId,
  onVideoClick,
  selectMode,
  selectedIds,
  onToggleSelect,
}: StatusColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  return (
    <div
      ref={setNodeRef}
      // `min-w-0` lets the grid track shrink below the intrinsic card width.
      // No `transform`/`scale` here: it would break both `position: sticky`
      // on the header and @dnd-kit pointer collision detection.
      className={`min-w-0 flex flex-col rounded-lg border transition-colors duration-200 ${statusColors[status]} ${
        isOver
          ? 'ring-2 ring-blue-400 shadow-lg border-blue-300'
          : ''
      }`}
    >
      <div
        className={`sticky z-20 rounded-t-lg px-2 xl:px-2 py-2.5 border-b border-gray-200/50 dark:border-gray-700/50 ${statusHeaderColors[status]}`}
        style={{ top: `${APP_HEADER_HEIGHT}px` }}
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotColors[status]}`} />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate" title={status}>{status}</span>
          </div>
          <span className="text-xs text-gray-400 bg-white/60 dark:bg-gray-800/60 px-1.5 py-0.5 rounded flex-shrink-0">
            {videos.length}
          </span>
        </div>
      </div>
      <div className="flex-1 p-1.5 xl:p-1.5 space-y-2 min-h-[400px]">
        {videos.map(video => (
          <DraggableVideoCard
            key={video.id}
            video={video}
            canDrag={canDrag}
            isBeingDragged={video.id === activeVideoId}
            onClick={() => onVideoClick(video.id, video.bucket)}
            selectMode={selectMode}
            isSelected={!!selectedIds?.has(video.id)}
            onToggleSelect={onToggleSelect}
          />
        ))}
        {videos.length === 0 && (
          <div className={`text-center text-xs py-8 rounded-lg border-2 border-dashed transition-colors ${
            isOver ? 'border-blue-300 text-blue-400 bg-blue-50/50 dark:bg-blue-900/20' : 'border-transparent text-gray-300 dark:text-gray-600'
          }`}>
            {isOver ? 'Drop here' : canDrag ? 'Drag videos here' : 'No videos'}
          </div>
        )}
      </div>
    </div>
  );
}

interface DraggableVideoCardProps {
  video: Video;
  canDrag: boolean;
  isBeingDragged: boolean;
  onClick: () => void;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect?: (videoId: string) => void;
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

  const streamUrl = videoService.getStreamUrl(video.id, video.bucket);
  return (
    <div className="relative w-full aspect-video rounded overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900 mb-2">
      <video
        src={streamUrl}
        muted
        playsInline
        preload="metadata"
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
        <div className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow">
          <Play className="h-3.5 w-3.5 text-gray-900 ml-0.5" />
        </div>
      </div>
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
      className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all flex-shrink-0 ${
        state === 'copied'
          ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400'
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

function DraggableVideoCard({
  video,
  canDrag,
  isBeingDragged,
  onClick,
  selectMode,
  isSelected,
  onToggleSelect,
}: DraggableVideoCardProps) {
  // Drag is fully disabled while selecting so a click can never change status.
  const dragEnabled = canDrag && !selectMode;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: video.id,
    disabled: !dragEnabled,
  });
  const didDrag = useRef(false);

  const style: React.CSSProperties | undefined = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined;

  if (isBeingDragged) {
    return (
      <div
        ref={setNodeRef}
        className="rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/30 dark:bg-blue-900/20 h-16"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-lg overflow-hidden hover:shadow-sm transition-shadow group border ${
        isSelected
          ? 'border-blue-500 ring-2 ring-blue-400/60 bg-blue-50 dark:bg-blue-950/60'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
      } ${dragEnabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
    >
      {selectMode && (
        <button
          type="button"
          aria-label={isSelected ? 'Deselect video' : 'Select video'}
          aria-pressed={isSelected}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.(video.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`absolute top-1.5 left-1.5 z-10 h-5 w-5 rounded flex items-center justify-center border-2 shadow-sm transition-colors ${
            isSelected
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white/95 dark:bg-gray-900/95 border-gray-300 dark:border-gray-500 text-transparent hover:border-blue-400'
          }`}
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </button>
      )}

      {dragEnabled && (
        <div
          {...listeners}
          {...attributes}
          onPointerDown={(e) => {
            didDrag.current = false;
            listeners?.onPointerDown?.(e);
          }}
          onPointerMove={() => { didDrag.current = true; }}
          className="flex items-center justify-center py-1.5 bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700 cursor-grab active:cursor-grabbing touch-none hover:bg-gray-100/80 dark:hover:bg-gray-700/80 transition-colors"
        >
          <div className="flex items-center gap-1">
            <GripVertical className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-[9px] text-gray-400 font-medium select-none">Drag</span>
          </div>
        </div>
      )}

      <div
        onClick={(e) => {
          e.stopPropagation();
          // While selecting, clicking the card toggles selection instead of
          // opening the video detail page.
          if (selectMode) {
            onToggleSelect?.(video.id);
            return;
          }
          if (!didDrag.current) onClick();
        }}
        className="cursor-pointer p-2"
      >
        <KanbanThumbnail video={video} />

        <h3
          className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2 break-words [overflow-wrap:anywhere] mb-1.5"
          title={video.filename}
        >
          {video.filename}
        </h3>

        <div className="flex items-center justify-between gap-1 text-[10px] text-gray-400">
          <span className="truncate">{formatDate(video.created_at)}</span>
          <span className="flex-shrink-0">{formatBytes(video.size)}</span>
        </div>

        <div className="flex items-center justify-between gap-1 mt-1.5">
          {video.uploaded_by_name ? (
            <div className="flex items-center gap-1 text-[10px] text-gray-400 min-w-0">
              <User className="h-2.5 w-2.5 flex-shrink-0" />
              <span className="truncate" title={video.uploaded_by_name}>{video.uploaded_by_name}</span>
            </div>
          ) : (
            <div className="min-w-0" />
          )}
          <KanbanCopyLinkButton videoId={video.id} />
        </div>
      </div>
    </div>
  );
}
