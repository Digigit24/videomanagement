import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Video } from '@/types';
import { videoService } from '@/services/api.service';
import { ChevronLeft, ChevronRight, Play, Image } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, getDay } from 'date-fns';

interface CalendarViewProps {
  videos: Video[];
}

export default function CalendarView({ videos }: CalendarViewProps) {
  const navigate = useNavigate();
  const { bucket } = useParams<{ bucket: string }>();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = getDay(monthStart);

  const videosByDate = useMemo(() => {
    const map: Record<string, Video[]> = {};
    videos.forEach(v => {
      const dateKey = format(new Date(v.uploaded_at || v.created_at), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(v);
    });
    return map;
  }, [videos]);

  const selectedDateKey = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const selectedVideos = selectedDateKey ? (videosByDate[selectedDateKey] || []) : [];

  const statusDot: Record<string, string> = {
    'Draft': 'bg-slate-400', 'Pending': 'bg-amber-400', 'Under Review': 'bg-blue-400',
    'Approved': 'bg-emerald-400', 'Changes Needed': 'bg-orange-400', 'Rejected': 'bg-red-400', 'Posted': 'bg-violet-400',
  };

  return (
    <div className="space-y-4">
      {/* Calendar Grid */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {/* Month Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <h2 className="text-sm font-semibold text-gray-900">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7">
          {/* Empty cells for padding */}
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square border-b border-r border-gray-50" />
          ))}

          {days.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayVideos = videosByDate[dateKey] || [];
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());

            return (
              <button
                key={dateKey}
                onClick={() => setSelectedDate(isSelected ? null : day)}
                className={`aspect-square border-b border-r border-gray-50 p-1 flex flex-col items-center justify-start transition-all relative ${
                  isSelected ? 'bg-blue-50 ring-2 ring-blue-500 ring-inset' : 'hover:bg-gray-50'
                }`}
              >
                <span className={`text-xs font-medium mt-0.5 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-blue-600 text-white' : isSelected ? 'text-blue-700' : 'text-gray-700'
                }`}>
                  {format(day, 'd')}
                </span>
                {dayVideos.length > 0 && (
                  <div className="flex items-center gap-0.5 mt-1 flex-wrap justify-center">
                    {dayVideos.length <= 3 ? (
                      dayVideos.map((v, i) => (
                        <div
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${statusDot[v.status] || 'bg-gray-300'}`}
                        />
                      ))
                    ) : (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                        <span className="text-[8px] font-bold text-gray-500">{dayVideos.length}</span>
                      </>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Date Videos */}
      {selectedDate && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </h3>
            <span className="text-xs text-gray-400">{selectedVideos.length} item{selectedVideos.length !== 1 ? 's' : ''}</span>
          </div>

          {selectedVideos.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">No uploads on this day</p>
          ) : (
            <div className="space-y-2">
              {selectedVideos.map(v => (
                <div
                  key={v.id}
                  onClick={() => navigate(`/workspace/${bucket}/video/${v.id}`)}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
                >
                  {/* Thumbnail */}
                  <div className="w-16 h-10 rounded-md bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {(v.media_type || 'video') === 'photo' ? (
                      <Image className="h-4 w-4 text-gray-400" />
                    ) : (
                      <div className="relative w-full h-full bg-gray-900 flex items-center justify-center">
                        {v.thumbnail_key ? (
                          <img src={videoService.getThumbnailUrl(v.id)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Play className="h-4 w-4 text-gray-500" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                      {v.filename}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${
                        statusDot[v.status] ? '' : ''
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1 ${statusDot[v.status] || 'bg-gray-300'}`} />
                        {v.status}
                      </span>
                      {v.uploaded_by_name && (
                        <span className="text-[10px] text-gray-400">by {v.uploaded_by_name}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
