import { useState, useEffect } from 'react';
import { Comment } from '@/types';
import { commentService } from '@/services/api.service';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { MessageCircle, Send, Clock, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface CommentsSectionProps {
  videoId: string;
  currentTime: number;
  onSeekTo: (time: number) => void;
}

export default function CommentsSection({ videoId, currentTime, onSeekTo }: CommentsSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadComments();
  }, [videoId]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const data = await commentService.getComments(videoId);
      setComments(data);
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const timestamp = Math.floor(currentTime);
      const comment = await commentService.addComment(videoId, newComment, timestamp);

      // Optimistic update
      setComments([comment, ...comments]);
      setNewComment('');
    } catch (error) {
      console.error('Failed to add comment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await commentService.deleteComment(commentId);
      setComments(comments.filter(c => c.id !== commentId));
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };

  const formatTimestamp = (seconds: number | null) => {
    if (seconds === null) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="h-5 w-5 text-gray-600" />
        <h3 className="text-lg font-semibold">Comments ({comments.length})</h3>
      </div>

      {/* Add Comment Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            disabled={submitting}
          />
          <Button type="submit" disabled={submitting || !newComment.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Clock className="h-3 w-3" />
          <span>
            Comment will be added at: {formatTimestamp(Math.floor(currentTime))}
          </span>
        </div>
      </form>

      {/* Comments List */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading comments...</div>
        ) : comments.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>No comments yet. Be the first to comment!</p>
          </div>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onSeekTo={onSeekTo}
              onDelete={handleDelete}
              formatTimestamp={formatTimestamp}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface CommentItemProps {
  comment: Comment;
  onSeekTo: (time: number) => void;
  onDelete: (id: string) => void;
  formatTimestamp: (seconds: number | null) => string | null;
}

function CommentItem({ comment, onSeekTo, onDelete, formatTimestamp }: CommentItemProps) {
  const currentUserEmail = localStorage.getItem('user');
  const isOwnComment = comment.user_email === currentUserEmail;

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
    <div className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
          {getInitials(comment.user_name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm text-gray-900">
              {comment.user_name}
            </span>
            {comment.video_timestamp !== null && (
              <button
                onClick={() => onSeekTo(comment.video_timestamp!)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                <Clock className="h-3 w-3" />
                {formatTimestamp(comment.video_timestamp)}
              </button>
            )}
            <span className="text-xs text-gray-400">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm text-gray-700">{comment.content}</p>
        </div>
        {isOwnComment && (
          <button
            onClick={() => onDelete(comment.id)}
            className="text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
            title="Delete comment"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
