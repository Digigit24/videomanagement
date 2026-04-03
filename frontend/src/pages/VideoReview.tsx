import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { publicVideoService } from '@/services/api.service';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import 'videojs-contrib-quality-levels';
import type Player from 'video.js/dist/types/player';
import { registerCustomComponents } from '@/components/videojs-custom-plugins';

registerCustomComponents();

import { Send, Reply, User, MessageCircle, Loader2, ShieldX, X, Paperclip, Smile, Image, FileVideo, FileText, File, Download, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface Review {
  id: string;
  video_id: string;
  reviewer_name: string;
  content: string;
  reply_to: string | null;
  reply_content?: string;
  reply_reviewer_name?: string;
  created_at: string;
  attachment?: {
    id: string;
    filename: string;
    size: number;
    content_type: string;
    url: string;
  };
}

const QUICK_REACTIONS = [
  { emoji: "👍", label: "Looks good" },
  { emoji: "✅", label: "Approved" },
  { emoji: "🔄", label: "Needs changes" },
  { emoji: "❤️", label: "Love it" },
];

const EMOJI_CATEGORIES = [
  { label: "Smileys", emojis: ["😊", "😂", "🤣", "😍", "🥰", "😘", "😜", "🤪", "😎", "🤩", "🥳", "😅", "😇", "🙂", "😉", "😋"] },
  { label: "Gestures", emojis: ["👍", "👎", "👏", "🙌", "🤝", "💪", "✌️", "🤞", "👌", "🫡", "👋", "🙏", "💅", "🤙", "👀", "🫶"] },
  { label: "Hearts", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💯", "💕", "💖", "💗", "💝", "❣️", "💔", "🫀"] },
];

export default function VideoReview() {
  const { videoId } = useParams<{ videoId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || undefined;
  const isFromFolder = searchParams.get('folder') === '1';
  const isMobile = useRef(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  const autoFsDone = useRef(false);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef(true);

  const [video, setVideo] = useState<any>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [reviewerName, setReviewerName] = useState(() => localStorage.getItem('reviewerName') || '');
  const [nameSet, setNameSet] = useState(() => !!localStorage.getItem('reviewerName'));
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Review | null>(null);
  const [, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [, setIntroShown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (videoId) {
      loadVideo();
      loadReviews();
    }
    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [videoId]);

  // Re-initialize player when nameSet becomes true (video container now exists)
  useEffect(() => {
    if (nameSet && video && video.hls_ready) {
      setTimeout(() => initPlayer(video), 100);
    }
  }, [nameSet]);

  // Poll for new reviews with exponential backoff (5s → 30s)
  useEffect(() => {
    if (!videoId || !nameSet) return;
    let cancelled = false;
    let delay = 5000;
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => {
      if (cancelled) return;
      loadReviews();
      delay = Math.min(delay * 1.3, 30000);
      timer = setTimeout(poll, delay);
    };
    timer = setTimeout(poll, delay);
    const resetDelay = () => { delay = 5000; };
    window.addEventListener('focus', resetDelay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('focus', resetDelay);
    };
  }, [videoId, nameSet]);

  // Poll for processing status with exponential backoff
  useEffect(() => {
    if (!videoId || !processing) return;
    let cancelled = false;
    let delay = 5000;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (cancelled) return;
      try {
        const data = await publicVideoService.getVideoInfo(videoId!, token);
        if (!cancelled && data.hls_ready) {
          setVideo(data);
          setProcessing(false);
          if (nameSet) {
            setTimeout(() => initPlayer(data), 100);
          }
          return;
        }
      } catch {}
      delay = Math.min(delay * 1.5, 30000);
      timer = setTimeout(poll, delay);
    };
    timer = setTimeout(poll, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [videoId, processing, nameSet, token]);

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

  // Listen for fullscreen changes
  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const loadVideo = async () => {
    if (!token) {
      setError('Invalid share link. A valid share token is required.');
      setLoading(false);
      return;
    }
    try {
      const data = await publicVideoService.getVideoInfo(videoId!, token);
      // Check if login is required and user is not authenticated
      if (data.require_login) {
        const userToken = localStorage.getItem('token');
        if (!userToken) {
          setRequiresLogin(true);
          setVideo(data);
          setLoading(false);
          return;
        }
      }
      setVideo(data);
      if (!data.hls_ready) {
        setProcessing(true);
      } else {
        setTimeout(() => initPlayer(data), 100);
      }
    } catch (err) {
      setError('This video is not available or the link has expired.');
    } finally {
      setLoading(false);
    }
  };

  const initPlayer = (videoData: any) => {
    if (!playerContainerRef.current || playerRef.current) return;
    if (!videoData.hls_ready) { setProcessing(true); return; }

    const hlsUrl = publicVideoService.getHLSUrl(videoData.id, token);

    // Dynamic element creation — avoids React/Video.js DOM conflicts
    const videoElement = document.createElement('video-js');
    videoElement.classList.add('vjs-big-play-centered');
    playerContainerRef.current.appendChild(videoElement);

    const player = videojs(videoElement as any, {
      controls: true,
      autoplay: false,
      preload: 'auto',
      playsinline: true,
      fill: true,
      html5: {
        vhs: {
          overrideNative: true,
          xhr: {
            beforeRequest: (options: Record<string, any>) => {
              if (token && options.uri && !options.uri.includes('token=')) {
                const separator = options.uri.includes('?') ? '&' : '?';
                options.uri = `${options.uri}${separator}token=${token}`;
              }
              return options;
            },
          },
        },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
      sources: [{ src: hlsUrl, type: 'application/x-mpegURL' }],
      controlBar: {
        children: [
          'playToggle',
          'skipBackwardButton',
          'skipForwardButton',
          'volumePanel',
          'currentTimeDisplay',
          'timeDivider',
          'durationDisplay',
          'progressControl',
          'qualityMenuButton',
          'fullscreenToggle',
        ],
      },
    });

    playerRef.current = player;

    // Detect portrait video and add CSS class for object-fit: cover
    player.on('loadedmetadata', () => {
      const videoEl = player.tech({ IWillNotUseThisInPlugins: true })?.el() as HTMLVideoElement | undefined;
      if (videoEl && videoEl.videoHeight > videoEl.videoWidth) {
        player.addClass('vjs-portrait');
      }
    });

    // Mobile: auto-fullscreen on first play + lock orientation
    if (isMobile.current) {
      player.on('play', () => {
        if (autoFsDone.current) return;
        autoFsDone.current = true;
        const videoEl = player.tech({ IWillNotUseThisInPlugins: true })?.el() as HTMLVideoElement | undefined;
        if (!videoEl) return;
        const goFs = (videoEl as any).webkitEnterFullscreen || videoEl.requestFullscreen?.bind(videoEl);
        if (goFs) { try { goFs.call(videoEl); } catch {} }
        if (screen.orientation && 'lock' in screen.orientation) {
          const portrait = videoEl.videoHeight > videoEl.videoWidth;
          (screen.orientation as any).lock(portrait ? 'portrait' : 'landscape').catch(() => {});
        }
      });
    }

    // Track play/pause state for layout
    player.on('play', () => setIsPlaying(true));
    player.on('pause', () => setIsPlaying(false));
    player.on('ended', () => setIsPlaying(false));

    // Intro overlay on first play
    let introHandled = false;
    player.on('play', () => {
      if (!introHandled) {
        introHandled = true;
        player.pause();
        setShowIntro(true);
        setIntroShown(true);
        setTimeout(() => {
          setShowIntro(false);
          if (playerRef.current && !playerRef.current.isDisposed()) {
            playerRef.current.play();
          }
        }, 1500);
      }
    });

    player.on('error', () => {
      console.error('Video.js error:', player.error());
      setError('Failed to load video stream.');
    });
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


  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAttachment(file);
    e.target.value = "";
  };

  const insertEmoji = (emoji: string) => {
    const cursorPos = inputRef.current?.selectionStart || message.length;
    const newValue = message.slice(0, cursorPos) + emoji + message.slice(cursorPos);
    setMessage(newValue);
    setTimeout(() => {
      if (inputRef.current) {
        const newPos = cursorPos + emoji.length;
        inputRef.current.selectionStart = newPos;
        inputRef.current.selectionEnd = newPos;
        inputRef.current.focus();
      }
    }, 0);
  };

  // --- Form handlers ---
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
        attachment || undefined,
      );
      setReviews(prev => [...prev, review]);
      setMessage('');
      setReplyTo(null);
      setAttachment(null);
      setShowEmojiPicker(false);
      isNearBottomRef.current = true;
      inputRef.current?.focus();
      if (inputRef.current) inputRef.current.style.height = 'auto';
    } catch (err) {
      console.error('Failed to send review:', err);
    } finally {
      setSending(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
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

  const getFileIcon = (ct: string) => {
    if (ct?.startsWith('image/')) return Image;
    if (ct?.startsWith('video/')) return FileVideo;
    if (ct?.includes('pdf')) return FileText;
    return File;
  };

  const renderAttachment = (att: { filename: string; content_type: string; size: number; url: string }) => {
    const Icon = getFileIcon(att.content_type);
    const isImage = att.content_type.startsWith('image/');
    const isVideo = att.content_type.startsWith('video/');

    return (
      <div className="mt-2 text-left">
        {isImage ? (
          <div className="relative group/att max-w-full">
            <img 
              src={att.url} 
              alt={att.filename} 
              className="max-h-60 rounded-lg object-contain bg-black/5 cursor-pointer hover:opacity-95 transition-opacity"
              onClick={() => window.open(att.url, '_blank')}
            />
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/att:opacity-100 transition-opacity">
              <a href={att.url} download={att.filename} className="p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70">
                <Download className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        ) : isVideo ? (
          <div className="relative group/att max-w-[300px] aspect-video bg-black rounded-lg overflow-hidden">
            <video src={att.url} className="w-full h-full object-contain" controls />
          </div>
        ) : (
          <a
            href={att.url}
            download={att.filename}
            className="flex items-center gap-3 px-3 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors w-fit max-w-full"
          >
            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0 pr-2">
              <p className="text-xs font-semibold truncate leading-tight text-gray-900">{att.filename}</p>
              <p className="text-[10px] mt-0.5 text-gray-500">{formatFileSize(att.size)}</p>
            </div>
            <Download className="h-4 w-4 text-gray-400 flex-shrink-0 ml-auto" />
          </a>
        )}
      </div>
    );
  };

  // --- Render states ---

  if (loading) {
    return (
      <div className="h-[100dvh] bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          <p className="text-gray-500 text-sm">Loading review...</p>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="h-[100dvh] bg-gray-50 flex items-center justify-center p-4">
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

  // Login required screen
  if (requiresLogin) {
    return (
      <div className="h-[100dvh] bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8 w-full max-w-sm text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <ShieldX className="h-7 w-7 text-amber-500" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Account Required</h1>
          <p className="text-sm text-gray-500 mb-1">You need to log in to view this video.</p>
          <p className="text-xs text-gray-400 mb-6 truncate">{video?.filename}</p>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-all duration-200 active:scale-[0.98]"
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

  // Name entry screen
  if (!nameSet) {
    return (
      <div className="h-[100dvh] bg-gray-50 flex items-center justify-center p-4">
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
    <div className="h-[100dvh] bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2 flex items-center justify-between flex-shrink-0 z-10 shadow-sm relative">
        <div className="flex items-center gap-3 min-w-0">
          {isFromFolder && token && (
            <button
              onClick={() => navigate(`/shared/folder/${token}`)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              title="Back to folder"
            >
              <ArrowLeft className="h-4 w-4 text-gray-500" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900 tracking-tight">Review</span>
            <span className="text-gray-300">|</span>
          </div>
          <span className="text-xs text-gray-500 truncate font-medium">{video.filename}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowChat(!showChat)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
              showChat
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
            )}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Feedback
            {reviews.length > 0 && (
              <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{reviews.length}</span>
            )}
          </button>
          <div className="flex items-center gap-1.5 bg-gray-100 rounded-full pl-1 pr-3 py-1 border border-gray-200">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-[9px] text-white font-bold shadow-sm">
              {reviewerName.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-medium text-gray-700 max-w-[80px] truncate">{reviewerName}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row min-h-0 relative">
        {/* Video Player Section */}
        <div
          ref={playerContainerRef}
          className={cn(
            "w-full bg-black relative overflow-hidden flex-shrink-0 transition-all duration-300",
            isFullscreen
              ? "h-screen w-screen"
              : showChat
                ? "h-[45vh] sm:h-[50vh] md:flex-1 md:h-full"
                : "flex-1 h-full"
          )}
        >
          {processing && (
            <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center text-center px-6 z-10">
              <div className="w-10 h-10 border-[3px] border-gray-600 border-t-blue-400 rounded-full animate-spin mb-4" />
              <p className="text-gray-300 text-sm font-medium mb-1">Processing Video</p>
              <p className="text-gray-500 text-xs max-w-xs">
                Your video is being transcoded into multiple quality levels. This may take a few moments.
              </p>
            </div>
          )}
          {/* Video.js player gets dynamically appended here */}

          {/* Digitech Intro Overlay */}
          {showIntro && (
            <div className="absolute inset-0 flex items-center justify-center bg-black z-30">
              <div className="text-center">
                <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-wider animate-pulse">
                  Digitech
                </h1>
                <div className="mt-4 w-12 h-0.5 bg-white/40 mx-auto rounded-full" />
              </div>
            </div>
          )}
        </div>

        {/* Floating chat toggle */}
        {!showChat && (
          <button
            onClick={() => setShowChat(true)}
            className="absolute bottom-6 right-6 z-30 w-12 h-12 rounded-full bg-white shadow-xl border border-gray-200 flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
            title="Open feedback"
          >
            <MessageCircle className="h-5 w-5 text-gray-700" />
            {reviews.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {reviews.length}
              </span>
            )}
          </button>
        )}

        {/* Chat/Feedback Section — collapsible */}
        <div className={cn(
          "flex flex-col bg-white border-t md:border-t-0 md:border-l border-gray-200 min-h-0 relative z-0 transition-all duration-300",
          showChat
            ? "flex-1 md:flex-none md:w-80 lg:w-96 h-full"
            : "hidden"
        )}>

          {/* Messages List */}
          <div
            ref={messagesContainerRef}
            onScroll={checkNearBottom}
            className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-3 bg-gray-50/50"
          >
            {reviews.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <MessageCircle className="h-5 w-5 text-gray-400" />
                </div>
                <h3 className="text-sm font-medium text-gray-900">No feedback yet</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-[200px]">Start the conversation by adding a review or reaction.</p>

                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {QUICK_REACTIONS.map(({ emoji, label }) => (
                    <button
                      key={label}
                      onClick={() => handleQuickReaction(`${emoji} ${label}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm transition-all active:scale-95"
                    >
                      <span>{emoji}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
              {reviews.map((review, i) => {
                const isOwn = review.reviewer_name === reviewerName;
                const showAvatar = i === 0 || reviews[i - 1].reviewer_name !== review.reviewer_name;

                return (
                  <div
                    key={review.id}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-2' : 'mt-0.5'} group`}
                  >
                    <div className={`flex gap-2 max-w-[85%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                      {showAvatar ? (
                        <div className={`w-7 h-7 rounded-sm flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white shadow-sm ${
                          isOwn ? 'bg-blue-600' : 'bg-emerald-600'
                        }`}>
                          {review.reviewer_name.charAt(0).toUpperCase()}
                        </div>
                      ) : (
                        <div className="w-7 flex-shrink-0" />
                      )}

                      <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                        {showAvatar && (
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold text-gray-900">
                              {review.reviewer_name}
                            </span>
                            <span className="text-[9px] text-gray-400">
                              {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        )}

                        {review.reply_to && review.reply_content && (
                          <div className={`text-[10px] px-3 py-1.5 rounded-md border-l-2 mb-1 max-w-full opacity-75 ${
                            isOwn
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'bg-gray-100 border-gray-300 text-gray-600'
                          }`}>
                            <span className="font-semibold">{review.reply_reviewer_name}</span>
                            <span className="mx-1">&bull;</span>
                            <span className="italic truncate inline-block max-w-[150px] align-bottom">
                              {review.reply_content}
                            </span>
                          </div>
                        )}

                        <div
                          className={`px-3 py-2 text-sm leading-relaxed shadow-sm break-words relative group-hover:shadow-md transition-shadow ${
                            isOwn
                              ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm'
                              : 'bg-white border border-gray-200 text-gray-900 rounded-2xl rounded-tl-sm'
                          }`}
                        >
                          {review.content}
                          {review.attachment && renderAttachment(review.attachment)}
                        </div>

                        <button
                          onClick={() => {
                            setReplyTo(review);
                            inputRef.current?.focus();
                          }}
                          className={`mt-1 text-[10px] font-medium transition-colors opacity-0 group-hover:opacity-100 ${
                            isOwn ? 'text-blue-600 hover:text-blue-700' : 'text-gray-400 hover:text-gray-600'
                          }`}
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} className="h-1" />
              </>
            )}
          </div>

          {/* Quick Reactions Bar */}
          {reviews.length > 0 && (
            <div className="px-3 py-2 border-t border-gray-100 bg-white/50 backdrop-blur-sm">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">
                {QUICK_REACTIONS.map(({ emoji, label }) => (
                  <button
                    key={label}
                    onClick={() => handleQuickReaction(`${emoji} ${label}`)}
                    disabled={sending}
                    className="flex-shrink-0 px-2.5 py-1 bg-gray-50 border border-gray-200 hover:bg-white hover:shadow-sm rounded-full text-[10px] font-medium text-gray-600 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
                  >
                    <span>{emoji} {label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="bg-white border-t border-gray-200 p-3 flex-shrink-0 safe-pb">
            {/* Attachment preview */}
            {attachment && (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 bg-emerald-100 rounded flex items-center justify-center flex-shrink-0">
                    {attachment.type.startsWith('image/') ? (
                      <Image className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Paperclip className="h-4 w-4 text-emerald-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-emerald-900 truncate">{attachment.name}</p>
                    <p className="text-[10px] text-emerald-600">{formatFileSize(attachment.size)}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setAttachment(null)}
                  className="p-1 hover:bg-emerald-100 rounded-full text-emerald-500 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {replyTo && (
              <div className="flex items-center justify-between bg-blue-50/50 border border-blue-100 rounded-lg px-3 py-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Reply className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-blue-900 truncate">Replying to {replyTo.reviewer_name}</p>
                    <p className="text-[10px] text-blue-600 truncate italic">{replyTo.content}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setReplyTo(null)}
                  className="p-1 hover:bg-blue-100 rounded-full text-blue-500 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <form onSubmit={handleSendReview} className="flex items-end gap-2 relative">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
              />
              
              <div className="flex-1 flex flex-col bg-gray-50 rounded-2xl border border-gray-200 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 shadow-sm transition-all overflow-hidden relative">
                <textarea
                  ref={inputRef}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !sending) {
                      e.preventDefault();
                      handleSendReview(e as any);
                    }
                  }}
                  placeholder="Ask a question or leave feedback..."
                  className="w-full px-4 py-2.5 text-sm bg-transparent border-none focus:ring-0 resize-none max-h-[120px] min-h-[40px]"
                />
                
                <div className="flex items-center justify-between px-2 pb-1.5 pt-0.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"
                      title="Attach file"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className={cn(
                          "p-1.5 hover:bg-yellow-50 rounded-full transition-all",
                          showEmojiPicker ? "text-yellow-600 bg-yellow-50" : "text-gray-400 hover:text-yellow-600"
                        )}
                        title="Add emoji"
                      >
                        <Smile className="h-4 w-4" />
                      </button>

                      {showEmojiPicker && (
                        <div className="absolute bottom-full left-0 mb-3 bg-white border border-gray-200 rounded-2xl shadow-2xl p-3 z-[60] min-w-[280px]">
                          <div className="flex items-center justify-between mb-2 px-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Emojis</span>
                            <button onClick={() => setShowEmojiPicker(false)} className="text-gray-400 hover:text-gray-600">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-gray-200">
                            {EMOJI_CATEGORIES.map((cat) => (
                              <div key={cat.label}>
                                <div className="text-[10px] font-medium text-gray-400 mb-1.5 ml-1">{cat.label}</div>
                                <div className="grid grid-cols-8 gap-1">
                                  {cat.emojis.map((emoji) => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => insertEmoji(emoji)}
                                      className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 rounded-lg transition-colors active:scale-95"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className={`text-[10px] ${message.length > 900 ? 'text-red-500' : 'text-gray-300'} font-medium`}>
                    {message.length > 0 && `${message.length}/1000`}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={(!message.trim() && !attachment) || sending}
                className={cn(
                  "w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 shadow-md active:scale-95 flex-shrink-0",
                  (!message.trim() && !attachment) || sending
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none"
                    : "bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg"
                )}
              >
                {sending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </form>
            <p className="text-[10px] text-gray-400 text-center mt-2 hidden md:block">
              Press <span className="font-mono bg-gray-100 px-1 rounded">Enter</span> to send, <span className="font-mono bg-gray-100 px-1 rounded">Shift+Enter</span> for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
