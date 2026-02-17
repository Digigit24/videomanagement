import { useRef, useState, useEffect, useCallback } from "react";
import { Comment, WorkspaceMember } from "@/types";
import { commentService, reviewService, workspaceService } from "@/services/api.service";
import { Button } from "./ui/button";
import {
  MessageCircle,
  Send,
  Clock,
  Trash2,
  Reply,
  X,
  Paperclip,
  FileVideo,
  Star,
  AtSign,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getApiUrl } from "@/lib/utils";

interface ClientReview {
  id: string;
  video_id: string;
  reviewer_name: string;
  content: string;
  created_at: string;
  isReview: true;
}

interface CommentsSectionProps {
  videoId: string;
  workspaceId?: string | null;
  comments: Comment[];
  currentTime: number;
  onSeekTo: (time: number) => void;
  onCommentAdded: (comment: Comment) => void;
  onCommentDeleted: (commentId: string) => void;
}

export default function CommentsSection({
  videoId,
  workspaceId,
  comments,
  currentTime,
  onSeekTo,
  onCommentAdded,
  onCommentDeleted,
}: CommentsSectionProps) {
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [includeTimestamp, setIncludeTimestamp] = useState(true);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [clientReviews, setClientReviews] = useState<ClientReview[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionCursorIndex, setMentionCursorIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const currentUserId = localStorage.getItem("userId");

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments.length, clientReviews.length]);

  useEffect(() => {
    loadClientReviews();
  }, [videoId]);

  useEffect(() => {
    if (workspaceId) {
      loadMembers();
    }
  }, [workspaceId]);

  useEffect(() => {
    setMentionCursorIndex(0);
  }, [mentionSearch]);

  const loadMembers = async () => {
    if (!workspaceId) return;
    try {
      const data = await workspaceService.getMembers(workspaceId);
      setMembers(data);
    } catch (error) {
      // Silently fail
    }
  };

  const loadClientReviews = async () => {
    try {
      const reviews = await reviewService.getVideoReviews(videoId);
      setClientReviews(reviews.map((r: any) => ({ ...r, isReview: true as const })));
    } catch (error) {
      // Reviews endpoint may not exist yet, silently fail
    }
  };

  // Merge comments and reviews into a single timeline sorted by created_at
  const mergedTimeline = [
    ...comments.map(c => ({ ...c, isReview: false as const })),
    ...clientReviews,
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // @mention logic
  const getMentionContext = useCallback(
    (value: string, cursorPos: number) => {
      const textBeforeCursor = value.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");
      if (lastAtIndex === -1) return null;
      if (lastAtIndex > 0) {
        const charBefore = textBeforeCursor[lastAtIndex - 1];
        if (charBefore !== " " && charBefore !== "\n") return null;
      }
      const searchText = textBeforeCursor.slice(lastAtIndex + 1);
      if (searchText.length > 40) return null;
      return { atIndex: lastAtIndex, searchText };
    },
    [],
  );

  const filteredMembers = members.filter(
    (m) =>
      m.id !== currentUserId &&
      (m.name.toLowerCase().includes(mentionSearch) ||
        m.email.toLowerCase().includes(mentionSearch)),
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setNewComment(value);

    const mentionCtx = getMentionContext(value, cursorPos);
    if (mentionCtx && members.length > 0) {
      setMentionSearch(mentionCtx.searchText.toLowerCase());
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const handleMentionSelect = (member: WorkspaceMember) => {
    const cursorPos = inputRef.current?.selectionStart || newComment.length;
    const mentionCtx = getMentionContext(newComment, cursorPos);

    if (mentionCtx) {
      const before = newComment.slice(0, mentionCtx.atIndex);
      const after = newComment.slice(cursorPos);
      const newValue = `${before}@${member.name} ${after}`;
      setNewComment(newValue);

      const newCursorPos = mentionCtx.atIndex + member.name.length + 2;
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = newCursorPos;
          inputRef.current.selectionEnd = newCursorPos;
        }
      }, 0);
    }
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showMentions) return;
    if (!newComment.trim() && !attachment) return;

    setSubmitting(true);
    try {
      const timestamp = includeTimestamp ? Math.floor(currentTime) : undefined;
      const comment = await commentService.addComment(
        videoId,
        newComment,
        timestamp,
        replyTo?.id,
        attachment || undefined,
      );

      onCommentAdded(comment);
      setNewComment("");
      setReplyTo(null);
      setAttachment(null);
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
    } catch (error) {
      console.error("Failed to add comment:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await commentService.deleteComment(commentId);
      onCommentDeleted(commentId);
    } catch (error) {
      console.error("Failed to delete comment:", error);
    }
  };

  const handleReply = (comment: Comment) => {
    setReplyTo(comment);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && filteredMembers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionCursorIndex((prev) =>
          prev < filteredMembers.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionCursorIndex((prev) =>
          prev > 0 ? prev - 1 : filteredMembers.length - 1,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const idx = Math.min(mentionCursorIndex, filteredMembers.length - 1);
        if (idx >= 0) {
          handleMentionSelect(filteredMembers[idx]);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const formatTimestamp = (seconds: number | null) => {
    if (seconds === null) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Render message content with @mention highlighting
  const renderContent = (content: string, isOwn: boolean) => {
    return content
      .split(/(@\w[\w\s]*)/g)
      .map((part, i) =>
        part.startsWith("@") ? (
          <span
            key={i}
            className={`font-bold ${isOwn ? "text-blue-100" : "text-blue-600"}`}
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      );
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl overflow-hidden">
      {/* Header - Thread Group Identity */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">
            Thread <span className="text-gray-400 font-normal">({mergedTimeline.length})</span>
          </h3>
          {members.length > 0 && (
            <span className="text-[9px] text-gray-400 font-medium">
              {members.length} members
            </span>
          )}
        </div>

        <div className="flex bg-gray-200/50 p-0.5 rounded-lg">
          <button
            onClick={() => setIncludeTimestamp(true)}
            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
              includeTimestamp
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            FEEDBACK
          </button>
          <button
            onClick={() => setIncludeTimestamp(false)}
            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
              !includeTimestamp
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            CHAT
          </button>
        </div>
      </div>

      {/* Messages List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 scroll-smooth"
        style={{ minHeight: '300px' }}
      >
        {mergedTimeline.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <MessageCircle className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900">No messages yet</p>
            <p className="text-xs text-gray-500 max-w-[160px] mx-auto mt-1">
              Be the first to start the conversation!
            </p>
          </div>
        ) : (
          mergedTimeline.map((item) => {
            if (item.isReview) {
              const review = item as ClientReview;
              return (
                <div key={`review-${review.id}`} className="group flex items-start gap-2.5 animate-fade-in">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 shadow-sm bg-emerald-500">
                    <Star className="h-3 w-3" />
                  </div>
                  <div className="flex flex-col max-w-[85%] items-start">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-bold text-emerald-700">{review.reviewer_name}</span>
                      <span className="text-[8px] px-1 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium border border-emerald-100">Client</span>
                    </div>
                    <div className="relative px-3 py-2 rounded-2xl rounded-tl-none text-sm bg-emerald-50 text-gray-800 border border-emerald-100">
                      <p className="whitespace-pre-wrap leading-relaxed text-[13px]">{review.content}</p>
                      <div className="text-[9px] mt-1 text-right text-emerald-400">
                        {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            const comment = item as Comment & { isReview: false };
            const isOwn = comment.user_id === currentUserId;
            return (
              <div
                key={comment.id}
                className={`group flex items-start gap-2.5 ${isOwn ? 'flex-row-reverse' : ''}`}
              >
                {!isOwn && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 shadow-sm bg-gray-400">
                    {getInitials(comment.user_name)}
                  </div>
                )}

                <div className={`flex flex-col max-w-[85%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  {!isOwn && (
                    <span className="text-[10px] font-bold text-blue-600 mb-0.5 ml-1">
                      {comment.user_name}
                    </span>
                  )}

                  <div className={`relative px-3 py-2 rounded-2xl text-sm ${
                    isOwn
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                  }`}>
                    {comment.reply_to && (
                      <div className={`text-[10px] mb-1.5 pb-1.5 border-b ${
                        isOwn ? 'border-blue-400/50 text-blue-100' : 'border-gray-200 text-gray-500'
                      }`}>
                        <Reply className="h-2.5 w-2.5 inline mr-1" />
                        Replying to <span className="font-bold">{comment.reply_user_name}</span>
                      </div>
                    )}

                    <p className="whitespace-pre-wrap leading-relaxed text-[13px]">
                      {renderContent(comment.content, isOwn)}
                    </p>

                    {comment.video_timestamp !== null && (
                      <button
                        onClick={() => onSeekTo(comment.video_timestamp!)}
                        className={`mt-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono transition-colors ${
                          isOwn
                            ? 'bg-blue-500/50 hover:bg-blue-400 text-white border border-blue-400/50'
                            : 'bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 shadow-sm'
                        }`}
                      >
                        <Clock className="h-2.5 w-2.5" />
                        {formatTimestamp(comment.video_timestamp)}
                      </button>
                    )}

                    {comment.attachment && (
                      <div className="mt-2">
                        <a
                          href={getApiUrl(comment.attachment.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all border text-[11px] ${
                            isOwn
                              ? 'bg-blue-700/50 hover:bg-blue-700 text-blue-50 border-blue-400/50'
                              : 'bg-white hover:bg-blue-50 text-blue-600 border-blue-100'
                          }`}
                        >
                          <FileVideo className="h-3.5 w-3.5" />
                          <span className="font-medium truncate max-w-[100px]">
                            {comment.attachment.filename}
                          </span>
                        </a>
                      </div>
                    )}

                    <div className={`text-[9px] mt-1 text-right ${
                      isOwn ? "text-blue-200/70" : "text-gray-400"
                    }`}>
                      {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                    </div>
                  </div>

                  <div className={`mt-0.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                    isOwn ? 'flex-row-reverse' : ''
                  }`}>
                    <button onClick={() => handleReply(comment)} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all">
                      <Reply className="h-3 w-3" />
                    </button>
                    {isOwn && (
                      <button onClick={() => handleDelete(comment.id)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white border-t border-gray-100 relative">
        {/* Mention Picker Dropdown */}
        {showMentions && filteredMembers.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 mb-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-40 overflow-y-auto z-50 ring-1 ring-black/5">
            <div className="px-3 py-1.5 text-[9px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50 sticky top-0">
              <AtSign className="h-2.5 w-2.5 inline mr-1" />
              Mention Member
            </div>
            {filteredMembers.map((member, idx) => (
              <button
                key={member.id}
                type="button"
                onClick={() => handleMentionSelect(member)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  idx === mentionCursorIndex
                    ? "bg-blue-50"
                    : "hover:bg-gray-50"
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0">
                  {getInitials(member.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-900 truncate">{member.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{member.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-2">
          {replyTo && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-1 h-5 bg-blue-400 rounded-full" />
                <div className="min-w-0 text-xs">
                  <span className="font-bold text-blue-600 block text-[10px]">Reply to {replyTo.user_name}</span>
                  <p className="text-gray-500 truncate text-[10px]">{replyTo.content}</p>
                </div>
              </div>
              <button type="button" onClick={() => setReplyTo(null)} className="text-blue-400 hover:text-blue-600 p-1">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {attachment && (
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-xl">
              <FileVideo className="h-4 w-4 text-indigo-500" />
              <span className="text-xs text-indigo-700 truncate flex-1 font-medium">{attachment.name}</span>
              <button type="button" onClick={() => setAttachment(null)} className="text-indigo-400 hover:text-indigo-600 p-1">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all">
            {includeTimestamp && (
              <div className="flex items-center gap-1 px-2 py-1 bg-gray-900 text-white rounded-lg text-[10px] font-mono shadow-sm flex-shrink-0">
                <Clock className="h-3 w-3 text-blue-400" />
                {formatTimestamp(Math.floor(currentTime))}
              </div>
            )}

            <textarea
              ref={inputRef}
              value={newComment}
              onChange={handleInputChange}
              placeholder={includeTimestamp ? "Add feedback at this timestamp..." : "Type a message... Use @ to mention"}
              disabled={submitting}
              className="flex-1 min-h-[36px] max-h-28 py-2 px-2 text-sm bg-transparent outline-none resize-none placeholder:text-gray-400 scrollbar-hide"
              rows={1}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${target.scrollHeight}px`;
              }}
              onKeyDown={handleKeyDown}
            />

            <div className="flex items-center gap-1 mb-0.5 flex-shrink-0">
              <input type="file" ref={fileInputRef} className="hidden" accept="video/*" onChange={(e) => { if (e.target.files?.[0]) setAttachment(e.target.files[0]); e.target.value = ''; }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all" title="Attach video">
                <Paperclip className="h-4 w-4" />
              </button>
              <Button type="submit" disabled={submitting || (!newComment.trim() && !attachment)} className="h-8 w-8 rounded-xl shadow-lg shadow-blue-200 p-0">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
