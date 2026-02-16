import { Comment } from '@/types';
import { commentService } from '@/services/api.service';
import { Clock, CheckCircle2, Loader2, Circle } from 'lucide-react';

interface TimestampPanelProps {
  comments: Comment[];
  onSeekTo: (time: number) => void;
  onMarkerStatusUpdate: (commentId: string, newStatus: string) => void;
  currentTime: number;
  canEditStatus?: boolean;
}

const markerStatusConfig: Record<string, { label: string; color: string; icon: typeof Circle; bg: string }> = {
  pending: { label: 'Pending', color: 'text-amber-600', icon: Circle, bg: 'bg-amber-50 border-amber-200' },
  working: { label: 'Working', color: 'text-blue-600', icon: Loader2, bg: 'bg-blue-50 border-blue-200' },
  done: { label: 'Done', color: 'text-emerald-600', icon: CheckCircle2, bg: 'bg-emerald-50 border-emerald-200' },
};

const statusCycle = ['pending', 'working', 'done'];

export default function TimestampPanel({ comments, onSeekTo, onMarkerStatusUpdate, currentTime, canEditStatus = true }: TimestampPanelProps) {
  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const sortedComments = [...comments].sort((a, b) => (a.video_timestamp || 0) - (b.video_timestamp || 0));

  const handleStatusCycle = async (comment: Comment) => {
    if (!canEditStatus) return;

    const currentIdx = statusCycle.indexOf(comment.marker_status || 'pending');
    const nextStatus = statusCycle[(currentIdx + 1) % statusCycle.length];

    onMarkerStatusUpdate(comment.id, nextStatus);
    try {
      await commentService.updateMarkerStatus(comment.id, nextStatus);
    } catch (error) {
      console.error('Failed to update marker status:', error);
      onMarkerStatusUpdate(comment.id, comment.marker_status || 'pending');
    }
  };

  const isNearCurrent = (timestamp: number) => {
    return Math.abs(timestamp - currentTime) < 2;
  };

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Timestamp Markers</h3>
          <span className="text-xs text-gray-400">{comments.length} markers</span>
        </div>
      </div>

      <div className="max-h-[300px] overflow-y-auto">
        {sortedComments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4">
            <Clock className="h-8 w-8 text-gray-200 mb-2" />
            <p className="text-sm text-gray-400 text-center">
              No timestamp markers yet
            </p>
            <p className="text-xs text-gray-300 text-center mt-1">
              Add comments while playing to create markers
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {sortedComments.map((comment) => {
              const status = comment.marker_status || 'pending';
              const config = markerStatusConfig[status];
              const StatusIcon = config.icon;
              const isActive = isNearCurrent(comment.video_timestamp!);

              return (
                <div
                  key={comment.id}
                  className={`px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${
                    isActive ? 'bg-blue-50/50 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'
                  }`}
                  onClick={() => onSeekTo(comment.video_timestamp!)}
                >
                  <div className="flex items-start gap-3">
                    <button
                      className="flex-shrink-0 bg-gray-900 text-white text-xs font-mono px-2 py-1 rounded hover:bg-gray-700 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSeekTo(comment.video_timestamp!);
                      }}
                    >
                      {formatTimestamp(comment.video_timestamp!)}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 line-clamp-2">{comment.content}</p>
                      <p className="text-xs text-gray-400 mt-1">{comment.user_name}</p>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusCycle(comment);
                      }}
                      disabled={!canEditStatus}
                      className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium transition-colors ${config.bg} ${config.color} ${
                        canEditStatus ? 'cursor-pointer hover:opacity-80' : 'cursor-default opacity-75'
                      }`}
                      title={canEditStatus ? `Click to change status (${config.label})` : config.label}
                    >
                      <StatusIcon className="h-3 w-3" />
                      <span className="hidden sm:inline">{config.label}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
