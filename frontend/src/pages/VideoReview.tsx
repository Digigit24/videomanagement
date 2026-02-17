import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { publicVideoService } from '@/services/api.service';
import Hls from 'hls.js';
import { Send, Play, Reply, User, MessageCircle, Loader2, ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Review {
  id: string;
  video_id: string;
  reviewer_name: string;
  content: string;
  reply_to: string | null;
  reply_content?: string;
  reply_reviewer_name?: string;
  created_at: string;
}

export default function VideoReview() {
  const { videoId } = useParams<{ videoId: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [video, setVideo] = useState<any>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewerName, setReviewerName] = useState(() => localStorage.getItem('reviewerName') || '');
  const [nameSet, setNameSet] = useState(() => !!localStorage.getItem('reviewerName'));
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Review | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayer, setShowPlayer] = useState(true);

  useEffect(() => {
    if (videoId) {
      loadVideo();
      loadReviews();
    }
  }, [videoId]);

  useEffect(() => {
    scrollToBottom();
  }, [reviews]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadVideo = async () => {
    try {
      const data = await publicVideoService.getVideoInfo(videoId!);
      setVideo(data);
      initPlayer(data);
    } catch (err) {
      setError('This video is not available.');
    } finally {
      setLoading(false);
    }
  };

  const initPlayer = (videoData: any) => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (videoData.hls_ready && Hls.isSupported()) {
      const hls = new Hls({ startLevel: -1 });
      hls.loadSource(publicVideoService.getHLSUrl(videoData.id));
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.ERROR, () => {
        videoEl.src = publicVideoService.getStreamUrl(videoData.id);
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl') && videoData.hls_ready) {
      videoEl.src = publicVideoService.getHLSUrl(videoData.id);
    } else {
      videoEl.src = publicVideoService.getStreamUrl(videoData.id);
    }
  };

  const loadReviews = async () => {
    try {
      const data = await publicVideoService.getReviews(videoId!);
      setReviews(data);
    } catch (err) {
      console.error('Failed to load reviews:', err);
    }
  };

  const handleSetName = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewerName.trim()) return;
    localStorage.setItem('reviewerName', reviewerName.trim());
    setNameSet(true);
  };

  const handleSendReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sending) return;

    setSending(true);
    try {
      const review = await publicVideoService.addReview(
        videoId!,
        reviewerName,
        message.trim(),
        replyTo?.id,
      );
      setReviews(prev => [...prev, review]);
      setMessage('');
      setReplyTo(null);
      inputRef.current?.focus();
    } catch (err) {
      console.error('Failed to send review:', err);
    } finally {
      setSending(false);
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          <p className="text-gray-500 text-sm">Loading review...</p>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center animate-fade-in-up">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Review Unavailable</h1>
          <p className="text-gray-500 text-sm">{error || 'This review page could not be loaded.'}</p>
        </div>
      </div>
    );
  }

  // Name entry screen
  if (!nameSet) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8 w-full max-w-sm animate-fade-in-up">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
              <User className="h-6 w-6 text-blue-600" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">Join Review</h1>
            <p className="text-sm text-gray-500 mt-1">Enter your name to start reviewing</p>
            <p className="text-xs text-gray-400 mt-1 truncate">Video: {video.filename}</p>
          </div>
          <form onSubmit={handleSetName} className="space-y-4">
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              autoFocus
              required
            />
            <button
              type="submit"
              className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-all duration-200 active:scale-[0.98]"
            >
              Continue to Review
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 flex items-center justify-between flex-shrink-0 animate-fade-in-down">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-gray-900 tracking-tight">ReviewFlow</span>
          <span className="text-gray-300">|</span>
          <span className="text-xs text-gray-500 truncate">{video.filename}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPlayer(!showPlayer)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showPlayer ? '' : '-rotate-180'}`} />
            <span className="hidden sm:inline">{showPlayer ? 'Hide' : 'Show'} Video</span>
          </button>
          <div className="flex items-center gap-1.5 bg-gray-100 rounded-full px-2.5 py-1">
            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[9px] text-white font-bold">
              {reviewerName.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-medium text-gray-700">{reviewerName}</span>
          </div>
        </div>
      </div>

      {/* Video Player (collapsible) */}
      {showPlayer && (
        <div className="bg-black flex-shrink-0 relative animate-fade-in" style={{ maxHeight: '35vh' }}>
          <video
            ref={videoRef}
            className="w-full object-contain"
            style={{ maxHeight: '35vh' }}
            playsInline
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onClick={togglePlay}
          />
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <button
                onClick={togglePlay}
                className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-all"
              >
                <Play className="h-6 w-6 text-white ml-0.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-0.5">
        {reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 animate-fade-in">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <MessageCircle className="h-7 w-7 text-gray-300" />
            </div>
            <h3 className="text-sm font-medium text-gray-900 mb-1">No feedback yet</h3>
            <p className="text-xs text-gray-400 max-w-[240px]">
              Be the first to share your thoughts on this video
            </p>
          </div>
        ) : (
          reviews.map((review, i) => {
            const isOwn = review.reviewer_name === reviewerName;
            const showAvatar = i === 0 || reviews[i - 1].reviewer_name !== review.reviewer_name;

            return (
              <div
                key={review.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-3' : 'mt-0.5'} animate-fade-in-up`}
                style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: 'both' }}
              >
                <div className={`flex gap-2 max-w-[85%] sm:max-w-[70%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar */}
                  {showAvatar ? (
                    <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white ${
                      isOwn ? 'bg-blue-600' : 'bg-emerald-600'
                    }`}>
                      {review.reviewer_name.charAt(0).toUpperCase()}
                    </div>
                  ) : (
                    <div className="w-7 flex-shrink-0" />
                  )}

                  {/* Bubble */}
                  <div>
                    {showAvatar && (
                      <p className={`text-[10px] font-medium mb-0.5 ${isOwn ? 'text-right text-blue-600' : 'text-emerald-600'}`}>
                        {review.reviewer_name}
                      </p>
                    )}

                    {/* Reply reference */}
                    {review.reply_to && review.reply_content && (
                      <div className={`text-[10px] px-2.5 py-1 rounded-t-lg border-l-2 mb-0 ${
                        isOwn ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-gray-100 border-gray-300 text-gray-500'
                      }`}>
                        <span className="font-medium">{review.reply_reviewer_name}</span>: {review.reply_content.substring(0, 60)}
                        {(review.reply_content?.length || 0) > 60 ? '...' : ''}
                      </div>
                    )}

                    <div
                      className={`px-3 py-2 text-sm leading-relaxed ${
                        isOwn
                          ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm'
                          : 'bg-white border border-gray-200 text-gray-900 rounded-2xl rounded-tl-sm shadow-sm'
                      } ${review.reply_to ? 'rounded-t-lg' : ''}`}
                    >
                      {review.content}
                    </div>

                    <div className={`flex items-center gap-2 mt-0.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      <span className="text-[9px] text-gray-400">
                        {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
                      </span>
                      <button
                        onClick={() => setReplyTo(review)}
                        className="text-[9px] text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-0.5"
                      >
                        <Reply className="h-2.5 w-2.5" />
                        Reply
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 p-3 sm:p-4 flex-shrink-0 animate-slide-up">
        {/* Reply Preview */}
        {replyTo && (
          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 mb-2 animate-fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <Reply className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-gray-600">{replyTo.reviewer_name}</p>
                <p className="text-[10px] text-gray-400 truncate">{replyTo.content}</p>
              </div>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="text-xs text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0"
            >
              Cancel
            </button>
          </div>
        )}

        <form onSubmit={handleSendReview} className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendReview(e);
                }
              }}
              placeholder="Type your feedback..."
              rows={1}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none overflow-hidden"
              style={{ minHeight: '42px', maxHeight: '120px' }}
            />
          </div>
          <button
            type="submit"
            disabled={!message.trim() || sending}
            className="p-2.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 active:scale-95 flex-shrink-0"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
