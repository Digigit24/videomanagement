import { useState, useRef, useEffect } from 'react';
import { Comment } from '@/types';
import { commentService } from '@/services/api.service';
import { Button } from './ui/button';
import { MessageCircle, Send, Clock, Trash2, Reply, X, CornerDownRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [includeTimestamp, setIncludeTimestamp] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const timestamp = includeTimestamp ? Math.floor(currentTime) : undefined;
      const comment = await commentService.addComment(
        videoId,
        newComment,
        timestamp,
        replyTo?.id
      );

      onCommentAdded(comment);
      setNewComment('');
      setReplyTo(null);
    } catch (error) {
      console.error('Failed to add comment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await commentService.deleteComment(commentId);
      onCommentDeleted(commentId);
    } catch (error) {
      console.error('Failed to delete comment:', error);
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
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentUserId = localStorage.getItem('userId');

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700">
          Comments <span className="font-normal text-gray-400">({comments.length})</span>
        </h3>
      </div>

      {/* Comments List */}
      <div ref={listRef} className="space-y-1 max-h-[400px] overflow-y-auto mb-4 pr-1">
        {comments.length === 0 ? (
          <div className="text-center py-10">
            <MessageCircle className="h-10 w-10 mx-auto mb-2 text-gray-200" />
            <p className="text-sm text-gray-400">No comments yet</p>
            <p className="text-xs text-gray-300 mt-1">Start the conversation</p>
          </div>
        ) : (
          comments.map((comment) => (
            <CommentBubble
              key={comment.id}
              comment={comment}
              isOwn={comment.user_id === currentUserId}
              onSeekTo={onSeekTo}
              onDelete={handleDelete}
              onReply={handleReply}
              formatTimestamp={formatTimestamp}
            />
          ))
        )}
      </div>

      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-t-lg border-b-0">
          <CornerDownRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-blue-600">{replyTo.user_name}</span>
            <p className="text-xs text-gray-500 truncate">{replyTo.content}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className={`flex items-center gap-2 bg-white border border-gray-200 ${replyTo ? 'rounded-b-lg' : 'rounded-lg'} px-3 py-2`}>
        <button
          type="button"
          onClick={() => setIncludeTimestamp(!includeTimestamp)}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors flex-shrink-0 ${
            includeTimestamp
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
          }`}
          title={includeTimestamp ? 'Timestamp will be included' : 'Click to include timestamp'}
        >
          <Clock className="h-3 w-3" />
          <span className="font-mono">{formatTimestamp(Math.floor(currentTime))}</span>
        </button>

        <input
          ref={inputRef}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={replyTo ? `Reply to ${replyTo.user_name}...` : 'Type a comment...'}
          disabled={submitting}
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-300"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setReplyTo(null);
            }
          }}
        />

        <Button
          type="submit"
          size="sm"
          disabled={submitting || !newComment.trim()}
          className="h-7 w-7 p-0 rounded-full"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}

interface CommentBubbleProps {
  comment: Comment;
  isOwn: boolean;
  onSeekTo: (time: number) => void;
  onDelete: (id: string) => void;
  onReply: (comment: Comment) => void;
  formatTimestamp: (seconds: number | null) => string | null;
}

function CommentBubble({ comment, isOwn, onSeekTo, onDelete, onReply, formatTimestamp }: CommentBubbleProps) {
  const [showActions, setShowActions] = useState(false);

  const getInitials = (name: string | null) => {
    if (!name) return '??';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div
      className="group flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 mt-0.5">
        {getInitials(comment.user_name)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-gray-900">{comment.user_name}</span>

          {comment.video_timestamp !== null && (
            <button
              onClick={() => onSeekTo(comment.video_timestamp!)}
              className="inline-flex items-center gap-0.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 px-1.5 py-0.5 rounded font-mono transition-colors"
            >
              <Clock className="h-2.5 w-2.5" />
              {formatTimestamp(comment.video_timestamp)}
            </button>
          )}

          <span className="text-xs text-gray-300">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
          </span>
        </div>

        {/* Reply reference */}
        {comment.reply_to && comment.reply_content && (
          <div className="flex items-start gap-1.5 mb-1 pl-2 border-l-2 border-blue-200">
            <div className="min-w-0">
              <span className="text-xs font-medium text-blue-600">{comment.reply_user_name}</span>
              <p className="text-xs text-gray-400 truncate">{comment.reply_content}</p>
            </div>
          </div>
        )}

        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{comment.content}</p>
      </div>

      {/* Actions */}
      <div className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0'}`}>
        <button
          onClick={() => onReply(comment)}
          className="p-1 text-gray-300 hover:text-gray-600 rounded transition-colors"
          title="Reply"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>
        {isOwn && (
          <button
            onClick={() => onDelete(comment.id)}
            className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
