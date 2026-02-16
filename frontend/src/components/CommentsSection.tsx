import { useRef, useState, useEffect } from "react";
import { Comment } from "@/types";
import { commentService } from "@/services/api.service";
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getApiUrl } from "@/lib/utils";

interface CommentsSectionProps {
  videoId: string;
  comments: Comment[];
  currentTime: number;
  onSeekTo: (time: number) => void;
  onCommentAdded: (comment: Comment) => void;
  onCommentDeleted: (commentId: string) => void;
}

export default function CommentsSection({
  videoId,
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
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const formatTimestamp = (seconds: number | null) => {
    if (seconds === null) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const currentUserId = localStorage.getItem("userId");

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl overflow-hidden">
      {/* Header with Mode Toggle */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">
            Discussion <span className="text-gray-400 font-normal">({comments.length})</span>
          </h3>
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

      {/* Comments List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
        style={{ minHeight: '300px' }}
      >
        {comments.length === 0 ? (
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
          comments.map((comment) => (
            <div
              key={comment.id}
              className={`group flex items-start gap-3 ${comment.user_id === currentUserId ? 'flex-row-reverse' : ''}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 shadow-sm ${
                comment.user_id === currentUserId ? 'bg-blue-600' : 'bg-gray-400'
              }`}>
                {getInitials(comment.user_name)}
              </div>

              <div className={`flex flex-col max-w-[85%] ${comment.user_id === currentUserId ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-bold text-gray-900">
                    {comment.user_id === currentUserId ? 'Me' : comment.user_name}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                  </span>
                </div>

                <div className={`relative px-3 py-2 rounded-2xl text-sm ${
                  comment.user_id === currentUserId 
                    ? 'bg-blue-600 text-white rounded-tr-none shadow-blue-100 shadow-lg' 
                    : 'bg-gray-100 text-gray-800 rounded-tl-none'
                }`}>
                  {comment.reply_to && (
                    <div className={`text-[10px] mb-1.5 pb-1.5 border-b ${
                      comment.user_id === currentUserId ? 'border-blue-400 text-blue-100' : 'border-gray-200 text-gray-500'
                    }`}>
                      <Reply className="h-2.5 w-2.5 inline mr-1" />
                      Replying to <span className="font-bold">{comment.reply_user_name}</span>
                    </div>
                  )}

                  <p className="whitespace-pre-wrap leading-relaxed">{comment.content}</p>

                  {comment.video_timestamp !== null && (
                    <button
                      onClick={() => onSeekTo(comment.video_timestamp!)}
                      className={`mt-2 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-mono transition-colors ${
                        comment.user_id === currentUserId
                          ? 'bg-blue-500/50 hover:bg-blue-400 text-white border border-blue-400'
                          : 'bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 shadow-sm'
                      }`}
                    >
                      <Clock className="h-3 w-3" />
                      {formatTimestamp(comment.video_timestamp)}
                    </button>
                  )}

                  {comment.attachment && (
                    <div className="mt-2">
                      <a
                        href={getApiUrl(comment.attachment.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all border ${
                          comment.user_id === currentUserId
                            ? 'bg-blue-700/50 hover:bg-blue-700 text-blue-50 border-blue-400'
                            : 'bg-white hover:bg-blue-50 text-blue-600 border-blue-100'
                        }`}
                      >
                        <FileVideo className="h-4 w-4" />
                        <span className="text-[11px] font-medium truncate max-w-[120px]">
                          {comment.attachment.filename}
                        </span>
                      </a>
                    </div>
                  )}
                </div>

                <div className={`mt-1 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity ${
                  comment.user_id === currentUserId ? 'flex-row-reverse' : ''
                }`}>
                  <button onClick={() => handleReply(comment)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all">
                    <Reply className="h-3.5 w-3.5" />
                  </button>
                  {comment.user_id === currentUserId && (
                    <button onClick={() => handleDelete(comment.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-100">
        <form onSubmit={handleSubmit} className="space-y-3">
          {replyTo && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-1 h-6 bg-blue-400 rounded-full" />
                <div className="min-w-0 text-xs">
                  <span className="font-bold text-blue-600 block">Reply to {replyTo.user_name}</span>
                  <p className="text-gray-500 truncate">{replyTo.content}</p>
                </div>
              </div>
              <button type="button" onClick={() => setReplyTo(null)} className="text-blue-400 hover:text-blue-600 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {attachment && (
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-xl">
              <FileVideo className="h-4 w-4 text-indigo-500" />
              <span className="text-xs text-indigo-700 truncate flex-1 font-medium">{attachment.name}</span>
              <button type="button" onClick={() => setAttachment(null)} className="text-indigo-400 hover:text-indigo-600 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all">
            {includeTimestamp && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-900 text-white rounded-xl text-[10px] font-mono shadow-sm animate-in fade-in zoom-in-95 duration-200">
                <Clock className="h-3.5 w-3.5 text-blue-400" />
                {formatTimestamp(Math.floor(currentTime))}
              </div>
            )}
            
            <textarea
              ref={inputRef as any}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={includeTimestamp ? "Add feedback at this timestamp..." : "Send a message..."}
              disabled={submitting}
              className="flex-1 min-h-[40px] max-h-32 py-2 px-2 text-sm bg-transparent outline-none resize-none placeholder:text-gray-400 scrollbar-hide"
              rows={1}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
            />

            <div className="flex items-center gap-1 mb-0.5">
              <input type="file" ref={fileInputRef} className="hidden" accept="video/*" onChange={(e) => e.target.files?.[0] && setAttachment(e.target.files[0])} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all" title="Attach video">
                <Paperclip className="h-4 w-4" />
              </button>
              <Button type="submit" disabled={submitting || (!newComment.trim() && !attachment)} className="h-9 w-9 rounded-xl shadow-lg shadow-blue-200 p-0">
                <Send className="h-4 w-4 translate-x-0.5 -translate-y-0.5" />
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 px-2">
            Tip: Press <kbd className="font-sans font-bold">Enter</kbd> to send
          </p>
        </form>
      </div>
    </div>
  );
}
