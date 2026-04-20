import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Video, CalendarNote } from '@/types';
import { videoService, calendarNoteService } from '@/services/api.service';
import { ChevronLeft, ChevronRight, Play, Image, Plus, X, Clock, StickyNote, Trash2, Edit3, FileVideo } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay } from 'date-fns';

interface CalendarViewProps {
  videos: Video[];
}

const statusDot: Record<string, string> = {
  'Draft': 'bg-slate-400', 'Pending': 'bg-amber-400', 'Under Review': 'bg-blue-400',
  'Approved': 'bg-emerald-400', 'Changes Needed': 'bg-orange-400', 'Rejected': 'bg-red-400', 'Posted': 'bg-violet-400',
};

const NOTE_COLORS = [
  { name: 'blue', bg: 'bg-blue-100', dot: 'bg-blue-500', border: 'border-blue-300', text: 'text-blue-700', ring: 'ring-blue-400' },
  { name: 'green', bg: 'bg-emerald-100', dot: 'bg-emerald-500', border: 'border-emerald-300', text: 'text-emerald-700', ring: 'ring-emerald-400' },
  { name: 'amber', bg: 'bg-amber-100', dot: 'bg-amber-500', border: 'border-amber-300', text: 'text-amber-700', ring: 'ring-amber-400' },
  { name: 'red', bg: 'bg-red-100', dot: 'bg-red-500', border: 'border-red-300', text: 'text-red-700', ring: 'ring-red-400' },
  { name: 'purple', bg: 'bg-purple-100', dot: 'bg-purple-500', border: 'border-purple-300', text: 'text-purple-700', ring: 'ring-purple-400' },
  { name: 'pink', bg: 'bg-pink-100', dot: 'bg-pink-500', border: 'border-pink-300', text: 'text-pink-700', ring: 'ring-pink-400' },
];

function getNoteColor(color: string) {
  return NOTE_COLORS.find(c => c.name === color) || NOTE_COLORS[0];
}

export default function CalendarView({ videos }: CalendarViewProps) {
  const navigate = useNavigate();
  const { bucket } = useParams<{ bucket: string }>();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState<CalendarNote | null>(null);
  const [noteForm, setNoteForm] = useState({ title: '', content: '', noteTime: '', color: 'blue', videoId: '' });
  const [saving, setSaving] = useState(false);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = getDay(monthStart);

  useEffect(() => {
    if (bucket) loadNotes();
  }, [bucket, currentMonth]);

  const loadNotes = async () => {
    if (!bucket) return;
    try {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth() + 1;
      const data = await calendarNoteService.getNotes(bucket, year, month);
      setNotes(data);
    } catch {
      console.error('Failed to load calendar notes');
    }
  };

  const videosByDate = useMemo(() => {
    const map: Record<string, Video[]> = {};
    videos.forEach(v => {
      const dateKey = format(new Date(v.uploaded_at || v.created_at), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(v);
    });
    return map;
  }, [videos]);

  const notesByDate = useMemo(() => {
    const map: Record<string, CalendarNote[]> = {};
    notes.forEach(n => {
      const dateKey = n.note_date.slice(0, 10);
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(n);
    });
    return map;
  }, [notes]);

  const selectedDateKey = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const selectedVideos = selectedDateKey ? (videosByDate[selectedDateKey] || []) : [];
  const selectedNotes = selectedDateKey ? (notesByDate[selectedDateKey] || []) : [];

  const openAddNote = () => {
    setEditingNote(null);
    setNoteForm({ title: '', content: '', noteTime: '', color: 'blue', videoId: '' });
    setShowNoteModal(true);
  };

  const openEditNote = (note: CalendarNote) => {
    setEditingNote(note);
    setNoteForm({
      title: note.title,
      content: note.content || '',
      noteTime: note.note_time ? note.note_time.slice(0, 5) : '',
      color: note.color || 'blue',
      videoId: note.video_id || '',
    });
    setShowNoteModal(true);
  };

  const handleSaveNote = async () => {
    if (!noteForm.title.trim() || !selectedDateKey || !bucket) return;
    setSaving(true);
    try {
      if (editingNote) {
        const updated = await calendarNoteService.update(editingNote.id, {
          title: noteForm.title,
          content: noteForm.content || undefined,
          noteTime: noteForm.noteTime || undefined,
          color: noteForm.color,
          videoId: noteForm.videoId || null,
        });
        setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
      } else {
        const created = await calendarNoteService.create({
          bucket,
          noteDate: selectedDateKey,
          noteTime: noteForm.noteTime || undefined,
          title: noteForm.title,
          content: noteForm.content || undefined,
          color: noteForm.color,
          videoId: noteForm.videoId || undefined,
        });
        setNotes(prev => [...prev, created]);
      }
      setShowNoteModal(false);
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await calendarNoteService.delete(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
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
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square border-b border-r border-gray-50" />
          ))}

          {days.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayVideos = videosByDate[dateKey] || [];
            const dayNotes = notesByDate[dateKey] || [];
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            const hasItems = dayVideos.length > 0 || dayNotes.length > 0;

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
                {hasItems && (
                  <div className="flex items-center gap-0.5 mt-1 flex-wrap justify-center">
                    {dayVideos.length > 0 && dayVideos.length <= 3 && dayVideos.map((v, i) => (
                      <div key={`v-${i}`} className={`w-1.5 h-1.5 rounded-full ${statusDot[v.status] || 'bg-gray-300'}`} />
                    ))}
                    {dayVideos.length > 3 && (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                        <span className="text-[8px] font-bold text-gray-500">{dayVideos.length}</span>
                      </>
                    )}
                    {dayNotes.length > 0 && (
                      <div className="flex items-center gap-0.5 ml-0.5">
                        {dayNotes.slice(0, 2).map((n, i) => (
                          <div key={`n-${i}`} className={`w-1.5 h-1.5 rounded-sm ${getNoteColor(n.color).dot}`} />
                        ))}
                        {dayNotes.length > 2 && (
                          <span className="text-[7px] font-bold text-gray-400">+{dayNotes.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Date Panel */}
      {selectedDate && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </h3>
            <button
              onClick={openAddNote}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add Note
            </button>
          </div>

          {/* Notes Section */}
          {selectedNotes.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <StickyNote className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</span>
              </div>
              <div className="space-y-2">
                {selectedNotes.map(note => {
                  const color = getNoteColor(note.color);
                  return (
                    <div key={note.id} className={`${color.bg} border ${color.border} rounded-lg p-3 group`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className={`text-sm font-medium ${color.text}`}>{note.title}</h4>
                            {note.note_time && (
                              <span className="flex items-center gap-0.5 text-[10px] text-gray-500 bg-white/60 px-1.5 py-0.5 rounded">
                                <Clock className="h-2.5 w-2.5" />
                                {note.note_time.slice(0, 5)}
                              </span>
                            )}
                          </div>
                          {note.content && (
                            <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">{note.content}</p>
                          )}
                          {note.video_filename && (
                            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-500">
                              <FileVideo className="h-2.5 w-2.5" />
                              <span>{note.video_filename}</span>
                            </div>
                          )}
                          {note.created_by_name && (
                            <p className="text-[10px] text-gray-400 mt-1">by {note.created_by_name}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditNote(note)}
                            className="p-1 hover:bg-white/60 rounded transition-colors"
                          >
                            <Edit3 className="h-3 w-3 text-gray-400" />
                          </button>
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="p-1 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="h-3 w-3 text-red-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Videos Section */}
          {selectedVideos.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <FileVideo className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Uploads ({selectedVideos.length})
                </span>
              </div>
              <div className="space-y-2">
                {selectedVideos.map(v => (
                  <div
                    key={v.id}
                    onClick={() => navigate(`/workspace/${bucket}/video/${v.id}`)}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
                  >
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
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                        {v.filename}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium">
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
            </div>
          )}

          {selectedVideos.length === 0 && selectedNotes.length === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center">
              No items on this day. Click "Add Note" to add a note or schedule a post.
            </p>
          )}
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && selectedDate && (
        <NoteModal
          date={selectedDate}
          videos={videos}
          form={noteForm}
          setForm={setNoteForm}
          saving={saving}
          isEditing={!!editingNote}
          onSave={handleSaveNote}
          onClose={() => setShowNoteModal(false)}
        />
      )}
    </div>
  );
}

interface NoteModalProps {
  date: Date;
  videos: Video[];
  form: { title: string; content: string; noteTime: string; color: string; videoId: string };
  setForm: (form: { title: string; content: string; noteTime: string; color: string; videoId: string }) => void;
  saving: boolean;
  isEditing: boolean;
  onSave: () => void;
  onClose: () => void;
}

function NoteModal({ date, videos, form, setForm, saving, isEditing, onSave, onClose }: NoteModalProps) {
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            {isEditing ? 'Edit Note' : 'Add Note'} — {format(date, 'MMM d, yyyy')}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Title *</label>
            <input
              ref={titleRef}
              type="text"
              placeholder="e.g., Schedule post for Instagram"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && form.title.trim()) onSave(); }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
          </div>

          {/* Content */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Details</label>
            <textarea
              placeholder="Add details or description..."
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
            />
          </div>

          {/* Time */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              <Clock className="h-3 w-3 inline mr-1" />
              Scheduled Time (optional)
            </label>
            <input
              type="time"
              value={form.noteTime}
              onChange={(e) => setForm({ ...form, noteTime: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
          </div>

          {/* Link Video */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              <FileVideo className="h-3 w-3 inline mr-1" />
              Link to Video (optional)
            </label>
            <select
              value={form.videoId}
              onChange={(e) => setForm({ ...form, videoId: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
            >
              <option value="">No video linked</option>
              {videos.map(v => (
                <option key={v.id} value={v.id}>{v.filename}</option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">Color</label>
            <div className="flex items-center gap-2">
              {NOTE_COLORS.map(c => (
                <button
                  key={c.name}
                  onClick={() => setForm({ ...form, color: c.name })}
                  className={`w-6 h-6 rounded-full ${c.dot} transition-all ${
                    form.color === c.name ? 'ring-2 ring-offset-2 ' + c.ring : 'hover:scale-110'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!form.title.trim() || saving}
            className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : isEditing ? 'Update' : 'Add Note'}
          </button>
        </div>
      </div>
    </div>
  );
}
