import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { publicVideoService } from '@/services/api.service';
import Hls from 'hls.js';
import { Send, Play, Reply, User, MessageCircle, Loader2, ShieldX, X } from 'lucide-react';
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

const QUICK_REACTIONS = [
  { emoji: "👍", label: "Looks good" },
  { emoji: "✅", label: "Approved" },
  { emoji: "🔄", label: "Needs changes" },
  { emoji: "❤️", label: "Love it" },
];

export default function VideoReview() {
  const { videoId } = useParams<{ videoId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || undefined;
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef(true);

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

  useEffect(() => {
    if (videoId) {
      loadVideo();
      loadReviews();
    }
    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
    };
  }, [videoId]);

  // Re-initialize player when nameSet becomes true (video element now exists)
  useEffect(() => {
    if (nameSet && video && videoRef.current) {
      initPlayer(video);
    }
  }, [nameSet]);

  // Poll for new reviews every 5 seconds
  useEffect(() => {
    if (!videoId || !nameSet) return;
    const interval = setInterval(loadReviews, 5000);
    return () => clearInterval(interval);
  }, [videoId, nameSet]);

  // Check if user is near bottom before new messages arrive
  const checkNearBottom = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 80;
    }
  };

  // Auto-scroll only if near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [reviews.length]);

  const loadVideo = async () => {
    if (!token) {
      setError('Invalid share link. A valid share token is required.');
      setLoading(false);
      return;
    }
    try {
      const data = await publicVideoService.getVideoInfo(videoId!, token);
      setVideo(data);
      setTimeout(() => initPlayer(data), 100);
    } catch (err) {
      setError('This video is not available or the link has expired.');
    } finally {
      setLoading(false);
    }
  };

  const initPlayer = (videoData: any) => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (videoData.hls_ready && Hls.isSupported()) {
      const hls = new Hls({
        startLevel: -1,
        // Forward the share token to ALL HLS sub-requests (playlists & segments)
        xhrSetup: (xhr: XMLHttpRequest, url: string) => {
          if (token && !url.includes('token=')) {
            const separator = url.includes('?') ? '&' : '?';
            xhr.open('GET', `${url}${separator}token=${token}`, true);
          }
        },
      });
      hlsRef.current = hls;
      hls.loadSource(publicVideoService.getHLSUrl(videoData.id, token));
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
        if (data.fatal) {
          // Fallback to direct stream
          videoEl.src = publicVideoService.getStreamUrl(videoData.id, token);
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl') && videoData.hls_ready) {
      videoEl.src = publicVideoService.getHLSUrl(videoData.id, token);
    } else {
      videoEl.src = publicVideoService.getStreamUrl(videoData.id, token);
    }
  };

  const loadReviews = async () => {
    try {
      const data = await publicVideoService.getReviews(videoId!, token);
      setReviews((prev) => {
        if (JSON.stringify(prev.map(r => r.id)) === JSON.stringify(data.map((r: Review) => r.id))) {
          return prev;
        }
        return data;
      });
    } catch (err) {
      // Silent fail on poll
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
        token,
      );
      setReviews(prev => [...prev, review]);
      setMessage('');
      setReplyTo(null);
      isNearBottomRef.current = true;
      inputRef.current?.focus();
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    } catch (err) {
      console.error('Failed to send review:', err);
    } finally {
      setSending(false);
    }
  };

  const handleQuickReaction = async (text: string) => {
    if (sending) return;
    setSending(true);
    try {
      const review = await publicVideoService.addReview(
        videoId!,
        reviewerName,
        text,
        undefined,
        token,
      );
      setReviews(prev => [...prev, review]);
      isNearBottomRef.current = true;
    } catch (err) {
      console.error('Failed to send reaction:', err);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          <p className="text-gray-500 text-sm">Loading review...</p>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            {!token ? <ShieldX className="h-8 w-8 text-red-400" /> : <MessageCircle className="h-8 w-8 text-red-400" />}
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {!token ? 'Access Denied' : 'Review Unavailable'}
          </h1>
          <p className="text-gray-500 text-sm">{error || 'This review page could not be loaded.'}</p>
        </div>
      </div>
    );
  }

  // Name entry screen
  if (!nameSet) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
              <User className="h-6 w-6 text-blue-600" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">Join Review</h1>
            <p className="text-sm text-gray-500 mt-1">Enter your name to start reviewing</p>
            <p className="text-xs text-gray-400 mt-1 truncate">{video.filename}</p>
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
      {/* Header - compact */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-gray-900 tracking-tight">Review</span>
          <span className="text-gray-300">|</span>
          <span className="text-xs text-gray-500 truncate">{video.filename}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 bg-gray-100 rounded-full px-2.5 py-1">
            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[9px] text-white font-bold">
              {reviewerName.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-medium text-gray-700 max-w-[80px] truncate">{reviewerName}</span>
          </div>
        </div>
      </div>

      {/* Video Player - takes most of the screen */}
      <div className="bg-black flex-shrink-0 relative" style={{ height: '65vh', minHeight: '250px' }}>
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          controls
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
        {/* Overlay play button for first play */}
        {!isPlaying && videoRef.current && videoRef.current.currentTime === 0 && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer"
            onClick={() => { videoRef.current?.play(); }}
          >
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Play className="h-8 w-8 text-white ml-1" />
            </div>
          </div>
        )}
      </div>

      {/* Feedback area - compact, minimal height */}
      <div className="flex-1 flex flex-col min-h-0 bg-gray-50" style={{ maxHeight: '35vh' }}>
        {/* Messages */}
        <div
          ref={messagesContainerRef}
          onScroll={checkNearBottom}
          className="flex-1 overflow-y-auto px-3 py-1 space-y-0.5"
        >
          {reviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-4">
              <MessageCircle className="h-6 w-6 text-gray-300 mb-2" />
              <p className="text-xs text-gray-400">No feedback yet. Be the first!</p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                {QUICK_REACTIONS.map(({ emoji, label }) => (
                  <button
                    key={label}
                    onClick={() => handleQuickReaction(`${emoji} ${label}`)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200 rounded-full text-[10px] text-gray-600 hover:bg-gray-50 transition-all active:scale-95"
                  >
                    <span>{emoji}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            reviews.map((review, i) => {
              const isOwn = review.reviewer_name === reviewerName;
              const showAvatar = i === 0 || reviews[i - 1].reviewer_name !== review.reviewer_name;

              return (
                <div
                  key={review.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-2' : 'mt-0.5'}`}
                >
                  <div className={`flex gap-1.5 max-w-[85%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                    {showAvatar ? (
                      <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white ${
                        isOwn ? 'bg-blue-600' : 'bg-emerald-600'
                      }`}>
                        {review.reviewer_name.charAt(0).toUpperCase()}
                      </div>
                    ) : (
                      <div className="w-6 flex-shrink-0" />
                    )}

                    <div>
                      {showAvatar && (
                        <p className={`text-[9px] font-medium mb-0.5 ${isOwn ? 'text-right text-blue-600' : 'text-emerald-600'}`}>
                          {review.reviewer_name}
                        </p>
                      )}

                      {review.reply_to && review.reply_content && (
                        <div className={`text-[9px] px-2 py-0.5 rounded-t border-l-2 mb-0 ${
                          isOwn ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-gray-100 border-gray-300 text-gray-500'
                        }`}>
                          <span className="font-medium">{review.reply_reviewer_name}</span>: {review.reply_content.substring(0, 50)}
                          {(review.reply_content?.length || 0) > 50 ? '...' : ''}
                        </div>
                      )}

                      <div
                        className={`px-2.5 py-1.5 text-xs leading-relaxed ${
                          isOwn
                            ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm'
                            : 'bg-white border border-gray-200 text-gray-900 rounded-2xl rounded-tl-sm shadow-sm'
                        } ${review.reply_to ? 'rounded-t-lg' : ''}`}
                      >
                        {review.content}
                      </div>

                      <div className={`flex items-center gap-2 mt-0.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-[8px] text-gray-400">
                          {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
                        </span>
                        <button
                          onClick={() => {
                            setReplyTo(review);
                            inputRef.current?.focus();
                          }}
                          className="text-[8px] text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-0.5"
                        >
                          <Reply className="h-2 w-2" />
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

        {/* Quick reactions - compact */}
        {reviews.length > 0 && (
          <div className="px-3 pb-1 flex-shrink-0">
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {QUICK_REACTIONS.map(({ emoji, label }) => (
                <button
                  key={label}
                  onClick={() => handleQuickReaction(`${emoji} ${label}`)}
                  disabled={sending}
                  className="flex-shrink-0 px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded-full text-[9px] text-gray-600 transition-all active:scale-95 disabled:opacity-50"
                >
                  {emoji} {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area - compact */}
        <div className="bg-white border-t border-gray-200 p-2 flex-shrink-0">
          {replyTo && (
            <div className="flex items-center justify-between bg-gray-50 rounded-lg px-2 py-1 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <Reply className="h-3 w-3 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] font-medium text-gray-600">{replyTo.reviewer_name}</p>
                  <p className="text-[9px] text-gray-400 truncate">{replyTo.content}</p>
                </div>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600 p-0.5">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <form onSubmit={handleSendReview} className="flex items-end gap-1.5">
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
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 80)}px`;
                }}
                placeholder="Type your feedback..."
                rows={1}
                className="w-full px-3 py-2 border border-gray-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                style={{ minHeight: '36px', maxHeight: '80px' }}
              />
            </div>
            <button
              type="submit"
              disabled={!message.trim() || sending}
              className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all flex-shrink-0"
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
    </div>
  );
}
