import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Video, CalendarNote } from '@/types';
import { videoService, calendarNoteService } from '@/services/api.service';
import { ChevronLeft, ChevronRight, Play, Image, Plus, X, Clock, FileVideo, Search, ChevronDown } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay } from 'date-fns';

interface CalendarViewProps {
  videos: Video[];
  folderVideos: Video[];
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

export default function CalendarView({ videos, folderVideos }: CalendarViewProps) {
  const navigate = useNavigate();
  const { bucket } = useParams<{ bucket: string }>();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState<CalendarNote | null>(null);
  const [modalDate, setModalDate] = useState<string>('');
  const [noteForm, setNoteForm] = useState({ title: '', content: '', noteTime: '', color: 'blue', videoId: '' });
  const [saving, setSaving] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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

  const openAddNote = (dateKey: string) => {
    setEditingNote(null);
    setModalDate(dateKey);
    setNoteForm({ title: '', content: '', noteTime: '', color: 'blue', videoId: '' });
    setShowNoteModal(true);
  };

  const openEditNote = (note: CalendarNote) => {
    setEditingNote(note);
    setModalDate(note.note_date.slice(0, 10));
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
    if (!noteForm.title.trim() || !modalDate || !bucket) return;
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
          noteDate: modalDate,
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

  const handleDeleteNote = async (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await calendarNoteService.delete(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  return (
    <div>
      {/* Calendar */}
      <div className="bg-white border border-gray-200 rounded-xl md:rounded-2xl overflow-hidden shadow-md">
        {/* Month Header */}
        <div className="flex items-center justify-between px-3 md:px-5 py-3 md:py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50/60 to-violet-50/60">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 hover:bg-white/70 rounded-full transition-colors shadow-sm bg-white/40"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <div className="text-center">
            <h2 className="text-sm md:text-base font-bold text-gray-900 tracking-tight">
              {format(currentMonth, 'MMMM yyyy')}
            </h2>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="text-[10px] text-blue-500 hover:text-blue-700 font-medium mt-0.5 transition-colors"
            >
              Today
            </button>
          </div>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 hover:bg-white/70 rounded-full transition-colors shadow-sm bg-white/40"
          >
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => (
            <div key={d} className="text-center py-2 md:py-2.5 text-[10px] md:text-[11px] font-semibold text-gray-500 tracking-wide">
              <span className="hidden md:inline">{d}</span>
              <span className="hidden sm:inline md:hidden">{d.slice(0, 3)}</span>
              <span className="sm:hidden">{d.slice(0, 1)}</span>
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7">
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[64px] md:min-h-[130px] border-b border-r border-gray-100 bg-gray-50/20" />
          ))}

          {days.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayVideos = videosByDate[dateKey] || [];
            const dayNotes = notesByDate[dateKey] || [];
            const isToday = isSameDay(day, new Date());
            const isSun = getDay(day) === 0;

            return (
              <div
                key={dateKey}
                onClick={() => setSelectedDay(selectedDay === dateKey ? null : dateKey)}
                className={`min-h-[64px] md:min-h-[130px] border-b border-r border-gray-100 p-1 md:p-1.5 flex flex-col group/cell relative transition-colors cursor-pointer md:cursor-default ${
                  isToday ? 'bg-blue-50/40' : isSun ? 'bg-gray-50/30' : 'hover:bg-blue-50/20'
                } ${selectedDay === dateKey ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/30' : ''}`}
              >
                {/* Date number + add button */}
                <div className="flex items-center justify-between mb-0.5 md:mb-1 px-0.5">
                  <span className={`text-[10px] md:text-[11px] font-semibold w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full transition-colors ${
                    isToday
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}>
                    {format(day, 'd')}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); openAddNote(dateKey); }}
                    className="hidden md:inline-flex opacity-0 group-hover/cell:opacity-100 p-1 hover:bg-blue-100 rounded-full transition-all"
                    title="Add note"
                  >
                    <Plus className="h-3 w-3 text-blue-500" />
                  </button>
                </div>

                {/* Mobile: compact dot indicators */}
                <div className="flex flex-wrap gap-1 px-0.5 md:hidden">
                  {dayNotes.slice(0, 4).map(note => {
                    const color = getNoteColor(note.color);
                    return <div key={note.id} className={`w-2 h-2 rounded-full ${color.dot}`} />;
                  })}
                  {dayNotes.length > 4 && (
                    <span className="text-[8px] text-gray-400 leading-none self-center">+{dayNotes.length - 4}</span>
                  )}
                  {dayVideos.length > 0 && (
                    <div className="flex items-center gap-0.5">
                      <Play className="w-2 h-2 text-gray-400" />
                      <span className="text-[8px] text-gray-400 leading-none">{dayVideos.length}</span>
                    </div>
                  )}
                </div>

                {/* Desktop: full inline content */}
                <div className="hidden md:block flex-1 space-y-1 overflow-hidden">
                  {/* Notes rendered inline */}
                  {dayNotes.map(note => {
                    const color = getNoteColor(note.color);
                    const linkedVideo = note.video_id ? videos.find(v => v.id === note.video_id) || folderVideos.find(v => v.id === note.video_id) : null;
                    return (
                      <div
                        key={note.id}
                        onClick={(e) => { e.stopPropagation(); openEditNote(note); }}
                        className={`${color.bg} border ${color.border} rounded-md px-1.5 py-[3px] cursor-pointer group/note hover:shadow-sm transition-all`}
                      >
                        <div className="flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${color.dot} flex-shrink-0`} />
                          <span className={`text-[10px] font-semibold ${color.text} truncate flex-1`}>{note.title}</span>
                          {note.note_time && (
                            <span className="text-[8px] text-gray-500 bg-white/50 px-1 rounded flex-shrink-0">{note.note_time.slice(0, 5)}</span>
                          )}
                          <button
                            onClick={(e) => handleDeleteNote(note.id, e)}
                            className="opacity-0 group-hover/note:opacity-100 p-0.5 hover:bg-red-200/60 rounded flex-shrink-0"
                          >
                            <X className="h-2.5 w-2.5 text-red-500" />
                          </button>
                        </div>
                        {(linkedVideo || note.video_filename) && (
                          <div className="flex items-center gap-1 mt-0.5 ml-3">
                            {linkedVideo ? (
                              <VideoThumb video={linkedVideo} size="cell" />
                            ) : (
                              <div className="w-7 h-5 rounded bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center flex-shrink-0">
                                <Play className="h-2.5 w-2.5 text-gray-400" />
                              </div>
                            )}
                            <span className="text-[9px] text-gray-600 truncate">{linkedVideo?.filename || note.video_filename}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Videos rendered inline with thumbnail */}
                  {dayVideos.slice(0, 2).map(v => (
                    <div
                      key={v.id}
                      onClick={(e) => { e.stopPropagation(); navigate(`/workspace/${bucket}/video/${v.id}`); }}
                      className="flex items-center gap-1.5 p-1 rounded-md bg-gray-50/80 hover:bg-gray-100 cursor-pointer transition-colors border border-gray-100"
                    >
                      <VideoThumb video={v} size="cell" />
                      <span className="text-[10px] text-gray-700 font-medium truncate flex-1">{v.filename}</span>
                    </div>
                  ))}
                  {dayVideos.length > 2 && (
                    <div className="text-[9px] text-gray-400 px-1.5 font-medium">+{dayVideos.length - 2} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: Selected day detail panel */}
      {selectedDay && (() => {
        const selNotes = notesByDate[selectedDay] || [];
        const selVideos = videosByDate[selectedDay] || [];
        return (
          <div className="md:hidden bg-white border border-gray-200 rounded-xl mt-3 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-sm font-semibold text-gray-900">
                {format(new Date(selectedDay + 'T12:00:00'), 'EEEE, MMMM d')}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openAddNote(selectedDay)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add Note
                </button>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <X className="h-3.5 w-3.5 text-gray-400" />
                </button>
              </div>
            </div>

            <div className="p-3 space-y-2">
              {selNotes.length === 0 && selVideos.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No notes or videos for this day</p>
              )}

              {selNotes.map(note => {
                const color = getNoteColor(note.color);
                const linkedVideo = note.video_id ? videos.find(v => v.id === note.video_id) || folderVideos.find(v => v.id === note.video_id) : null;
                return (
                  <div
                    key={note.id}
                    onClick={() => openEditNote(note)}
                    className={`${color.bg} border ${color.border} rounded-lg px-3 py-2 cursor-pointer active:scale-[0.98] transition-all`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${color.dot} flex-shrink-0`} />
                      <span className={`text-xs font-semibold ${color.text} truncate flex-1`}>{note.title}</span>
                      {note.note_time && (
                        <span className="text-[10px] text-gray-500 bg-white/60 px-1.5 py-0.5 rounded flex-shrink-0">{note.note_time.slice(0, 5)}</span>
                      )}
                      <button
                        onClick={(e) => handleDeleteNote(note.id, e)}
                        className="p-1 hover:bg-red-200/60 rounded flex-shrink-0"
                      >
                        <X className="h-3 w-3 text-red-500" />
                      </button>
                    </div>
                    {note.content && (
                      <p className="text-[11px] text-gray-600 mt-1 ml-4 line-clamp-2">{note.content}</p>
                    )}
                    {(linkedVideo || note.video_filename) && (
                      <div className="flex items-center gap-1.5 mt-1.5 ml-4">
                        {linkedVideo ? (
                          <VideoThumb video={linkedVideo} size="sm" />
                        ) : (
                          <div className="w-8 h-5 rounded bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center flex-shrink-0">
                            <Play className="h-2.5 w-2.5 text-gray-400" />
                          </div>
                        )}
                        <span className="text-[10px] text-gray-600 truncate">{linkedVideo?.filename || note.video_filename}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {selVideos.map(v => (
                <div
                  key={v.id}
                  onClick={() => navigate(`/workspace/${bucket}/video/${v.id}`)}
                  className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors border border-gray-100 active:scale-[0.98]"
                >
                  <VideoThumb video={v} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{v.filename}</p>
                    <p className="text-[10px] text-gray-400">{v.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Note Modal */}
      {showNoteModal && modalDate && (
        <NoteModal
          dateLabel={format(new Date(modalDate + 'T12:00:00'), 'MMM d, yyyy')}
          videos={folderVideos}
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
  dateLabel: string;
  videos: Video[];
  form: { title: string; content: string; noteTime: string; color: string; videoId: string };
  setForm: (form: { title: string; content: string; noteTime: string; color: string; videoId: string }) => void;
  saving: boolean;
  isEditing: boolean;
  onSave: () => void;
  onClose: () => void;
}

function NoteModal({ dateLabel, videos, form, setForm, saving, isEditing, onSave, onClose }: NoteModalProps) {
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl md:rounded-xl shadow-xl w-full md:max-w-md max-h-[90vh] overflow-y-auto animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-2 mb-1 md:hidden" />
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            {isEditing ? 'Edit Note' : 'Add Note'} — {dateLabel}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Title *</label>
            <input
              ref={titleRef}
              type="text"
              placeholder="e.g., Schedule post for Instagram"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && form.title.trim()) onSave(); }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
          </div>

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

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              <FileVideo className="h-3 w-3 inline mr-1" />
              Link to Video (optional)
            </label>
            <VideoPickerDropdown
              videos={videos}
              selectedId={form.videoId}
              onSelect={(id) => setForm({ ...form, videoId: id })}
            />
          </div>

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

        <div className="flex items-center justify-end gap-2 px-4 py-3 pb-safe border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-3 py-2 md:py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!form.title.trim() || saving}
            className="px-4 py-2 md:py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : isEditing ? 'Update' : 'Add Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface VideoPickerDropdownProps {
  videos: Video[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function VideoPickerDropdown({ videos, selectedId, onSelect }: VideoPickerDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = videos.find(v => v.id === selectedId);

  const filtered = search
    ? videos.filter(v => v.filename.toLowerCase().includes(search.toLowerCase()))
    : videos;

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 text-sm border rounded-lg px-3 py-2 transition-all text-left bg-white ${
          open ? 'ring-2 ring-blue-400 border-transparent' : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        {selected ? (
          <>
            <VideoThumb video={selected} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900 truncate">{selected.filename}</p>
              <p className="text-[10px] text-gray-400">{selected.status}</p>
            </div>
          </>
        ) : (
          <span className="flex-1 text-gray-400">Select a video...</span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search videos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-sm pl-8 pr-3 py-2 md:py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-transparent"
              />
            </div>
          </div>

          <div className="max-h-60 md:max-h-52 overflow-y-auto">
            {selectedId && (
              <button
                onClick={() => { onSelect(''); setOpen(false); setSearch(''); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 transition-colors border-b border-gray-50"
              >
                <X className="h-3.5 w-3.5" />
                <span>No video linked</span>
              </button>
            )}

            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-gray-400">
                {search ? 'No videos match your search' : 'No videos in this folder'}
              </div>
            ) : (
              filtered.map(v => (
                <button
                  key={v.id}
                  onClick={() => { onSelect(v.id); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-blue-50 transition-colors ${
                    v.id === selectedId ? 'bg-blue-50' : ''
                  }`}
                >
                  <VideoThumb video={v} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{v.filename}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="inline-flex items-center text-[10px] text-gray-500">
                        <span className={`w-1.5 h-1.5 rounded-full mr-1 ${statusDot[v.status] || 'bg-gray-300'}`} />
                        {v.status}
                      </span>
                      {v.uploaded_by_name && (
                        <span className="text-[10px] text-gray-400">{v.uploaded_by_name}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function VideoThumb({ video, size }: { video: Video; size: 'sm' | 'md' | 'cell' }) {
  const [error, setError] = useState(false);
  const dim = size === 'cell' ? 'w-7 h-5' : size === 'sm' ? 'w-8 h-5' : 'w-12 h-7';

  if (video.thumbnail_key && !error) {
    return (
      <div className={`${dim} rounded bg-gray-900 overflow-hidden flex-shrink-0`}>
        <img
          src={videoService.getThumbnailUrl(video.id)}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setError(true)}
        />
      </div>
    );
  }

  return (
    <div className={`${dim} rounded bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center flex-shrink-0`}>
      {(video.media_type || 'video') === 'photo' ? (
        <Image className="h-2.5 w-2.5 text-gray-400" />
      ) : (
        <Play className="h-2.5 w-2.5 text-gray-400" />
      )}
    </div>
  );
}
