import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { publicVideoService } from '@/services/api.service';
import Hls from 'hls.js';
import { Send, Play, Pause, Reply, User, MessageCircle, Loader2, ShieldX, X, Settings, Check, Maximize, Minimize, Volume2, VolumeX, Paperclip, Smile, Image, FileVideo, FileText, File, Download, RotateCw } from 'lucide-react';
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
  const token = searchParams.get('token') || undefined;
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef(true);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout>>();

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
  const [isPlaying, setIsPlaying] = useState(false);

  // HLS quality state
  const [qualities, setQualities] = useState<{ index: number; height: number; width: number; bitrate: number }[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1); // -1 = auto
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [isPortrait, setIsPortrait] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Poll for processing status when video is not HLS-ready yet
  useEffect(() => {
    if (!videoId || !processing) return;
    const interval = setInterval(async () => {
      try {
        const data = await publicVideoService.getVideoInfo(videoId!, token);
        if (data.hls_ready) {
          setVideo(data);
          setProcessing(false);
          if (nameSet && videoRef.current) {
            setTimeout(() => initPlayer(data), 100);
          }
        }
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
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
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Close quality menu on outside click
  useEffect(() => {
    if (!showQualityMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.quality-panel')) {
        setShowQualityMenu(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showQualityMenu]);

  const loadVideo = async () => {
    if (!token) {
      setError('Invalid share link. A valid share token is required.');
      setLoading(false);
      return;
    }
    try {
      const data = await publicVideoService.getVideoInfo(videoId!, token);
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
    const videoEl = videoRef.current;
    if (!videoEl) return;

    // Reset player
    videoEl.pause();
    videoEl.removeAttribute('src');
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setQualities([]);
    setCurrentQuality(-1);
    setVideoLoading(true);

    if (!videoData.hls_ready) {
      setProcessing(true);
      return;
    }

    const hlsUrl = publicVideoService.getHLSUrl(videoData.id, token);

    if (Hls.isSupported()) {
      const hls = new Hls({
        startLevel: -1,              // Auto quality selection
        enableWorker: true,          // Web worker for faster parsing
        capLevelToPlayerSize: true,  // Match quality to player size
        maxBufferLength: 30,         // Buffer 30 seconds ahead
        maxMaxBufferLength: 60,      // Max 60 seconds buffer
        maxBufferSize: 60 * 1000 * 1000, // 60MB max buffer
        startFragPrefetch: true,     // Prefetch next fragment for faster playback
        lowLatencyMode: false,       // Not live streaming
        backBufferLength: 30,        // Keep 30s of back buffer for seeking
        testBandwidth: true,         // Test bandwidth for better ABR
        // Forward the share token to ALL HLS sub-requests
        xhrSetup: (xhr: XMLHttpRequest, url: string) => {
          if (token && !url.includes('token=')) {
            const separator = url.includes('?') ? '&' : '?';
            xhr.open('GET', `${url}${separator}token=${token}`, true);
          }
        },
      });
      hlsRef.current = hls;

      hls.loadSource(hlsUrl);
      hls.attachMedia(videoEl);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event: any, data: any) => {
        setVideoLoading(false);
        const levels = data.levels
          .map((level: any, index: number) => ({
            index,
            height: level.height,
            width: level.width,
            bitrate: level.bitrate,
          }))
          .sort((a: any, b: any) => b.height - a.height);
        setQualities(levels);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event: any, data: any) => {
        setCurrentQuality(data.level);
      });

      hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setError('Failed to load video stream.');
              break;
          }
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      videoEl.src = hlsUrl;
      videoEl.addEventListener('loadedmetadata', () => setVideoLoading(false), { once: true });
    } else {
      setError('Your browser does not support HLS video playback.');
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

  // --- Player controls ---
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!playerContainerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      playerContainerRef.current.requestFullscreen();
    }
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = percent * v.duration;
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    setDuration(v.duration || 0);
    if (v.buffered.length > 0) {
      setBuffered(v.buffered.end(v.buffered.length - 1));
    }
  }, []);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  const handleQualityChange = useCallback((levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setCurrentQuality(levelIndex);
    }
    setShowQualityMenu(false);
  }, []);

  const toggleRotation = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

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

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getQualityLabel = (height: number) => {
    if (height >= 2160) return '4K';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    return `${height}p`;
  };

  const formatBitrate = (bitrate: number) => {
    if (bitrate >= 1000000) return `${(bitrate / 1000000).toFixed(1)} Mbps`;
    return `${Math.round(bitrate / 1000)} Kbps`;
  };

  const getCurrentQualityLabel = () => {
    if (currentQuality === -1 || !qualities.length) return 'Auto';
    const level = qualities.find(l => l.index === currentQuality);
    return level ? getQualityLabel(level.height) : 'Auto';
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
      <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          <p className="text-gray-500 text-sm">Loading review...</p>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center p-4">
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
      <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center p-4">
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
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900 tracking-tight">Review</span>
            <span className="text-gray-300">|</span>
          </div>
          <span className="text-xs text-gray-500 truncate font-medium">{video.filename}</span>
        </div>

        <div className="flex items-center gap-2">
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
            "w-full md:flex-1 bg-black relative flex items-center justify-center overflow-hidden flex-shrink-0 group transition-all duration-300",
            isFullscreen
              ? ""
              : isPortrait
                ? "h-[75vh] sm:h-[80vh] md:h-full"
                : "h-[40vh] sm:h-[45vh] md:h-full"
          )}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { if (isPlaying) setShowControls(false); }}
        >
          {/* Rotating Content: Video or Processing UI */}
          <div 
            className="w-full h-full flex items-center justify-center transition-transform duration-500 ease-in-out"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            {processing ? (
              <div className="flex flex-col items-center justify-center text-center px-6">
                <div className="w-10 h-10 border-[3px] border-gray-600 border-t-blue-400 rounded-full animate-spin mb-4" />
                <p className="text-gray-300 text-sm font-medium mb-1">Processing Video</p>
                <p className="text-gray-500 text-xs max-w-xs">
                  Your video is being transcoded into multiple quality levels. This may take a few moments.
                </p>
              </div>
            ) : (
              <video
                ref={videoRef}
                className="w-full h-full object-contain cursor-pointer"
                playsInline
                onClick={togglePlay}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={() => {
                  setVideoLoading(false);
                  const v = videoRef.current;
                  if (v && v.videoWidth && v.videoHeight) {
                    setIsPortrait(v.videoHeight > v.videoWidth);
                  }
                }}
                onWaiting={() => setVideoLoading(true)}
                onPlaying={() => setVideoLoading(false)}
              />
            )}
          </div>

          {/* Non-Rotating Overlays: Loading, Controls, etc. */}
          {!processing && (
            <>
              {videoLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 pointer-events-none">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
                    <p className="text-gray-400 text-sm">Loading video...</p>
                  </div>
                </div>
              )}

              {/* Center play overlay - only on initial state */}
              {!isPlaying && !videoLoading && (
                <div
                  className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer z-10"
                  onClick={togglePlay}
                >
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-2xl transition-transform hover:scale-110 active:scale-95">
                    <Play className="h-7 w-7 sm:h-8 sm:w-8 text-white ml-0.5 fill-current" />
                  </div>
                </div>
              )}

              {/* Bottom controls overlay */}
              <div
                className={cn(
                  "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-3 sm:px-4 pb-2.5 sm:pb-3 pt-12 transition-opacity duration-300 z-20",
                  showControls ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Progress bar */}
                <div
                  className="w-full h-1 sm:h-1.5 bg-white/20 rounded-full mb-2.5 cursor-pointer group/bar relative"
                  onClick={handleSeek}
                >
                  <div
                    className="absolute h-full bg-white/30 rounded-full"
                    style={{ width: duration ? `${(buffered / duration) * 100}%` : '0%' }}
                  />
                  <div
                    className="absolute h-full bg-white rounded-full transition-[width] duration-100"
                    style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover/bar:opacity-100 transition-opacity"
                    style={{ left: duration ? `calc(${(currentTime / duration) * 100}% - 6px)` : '0' }}
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  {/* Left controls */}
                  <div className="flex items-center gap-1.5 sm:gap-2.5">
                    <button onClick={togglePlay} className="text-white hover:text-white/80 transition-colors p-1">
                      {isPlaying ? <Pause className="h-4 w-4 sm:h-5 sm:w-5" /> : <Play className="h-4 w-4 sm:h-5 sm:w-5" />}
                    </button>
                    <button onClick={toggleMute} className="text-white hover:text-white/80 transition-colors p-1 hidden sm:block">
                      {isMuted ? <VolumeX className="h-4 w-4 sm:h-5 sm:w-5" /> : <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />}
                    </button>
                    <span className="text-white text-[10px] sm:text-xs font-mono tabular-nums">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>

                  {/* Right controls */}
                  <div className="flex items-center gap-1 sm:gap-2">
                    {/* Quality selector */}
                    {qualities.length > 0 && (
                      <div className="relative quality-panel">
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowQualityMenu(!showQualityMenu); }}
                          className="flex items-center gap-1 sm:gap-1.5 bg-white/10 hover:bg-white/20 text-white text-[10px] sm:text-xs px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md sm:rounded-lg font-medium backdrop-blur-sm transition-all"
                        >
                          <Settings className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          <span>{getCurrentQualityLabel()}</span>
                        </button>

                        {showQualityMenu && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setShowQualityMenu(false); }} />
                            <div className="absolute bottom-9 sm:bottom-10 right-0 bg-gray-900/95 backdrop-blur-md rounded-lg sm:rounded-xl py-1 sm:py-1.5 min-w-[160px] sm:min-w-[200px] z-50 shadow-2xl border border-gray-700/50 overflow-hidden">
                              <div className="px-3 py-1 sm:py-1.5 text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700/50 mb-0.5 sm:mb-1">
                                Video Quality
                              </div>

                              {/* Auto option */}
                              <button
                                onClick={(e) => { e.stopPropagation(); handleQualityChange(-1); }}
                                className="flex items-center w-full text-left px-3 py-1.5 sm:py-2 text-xs text-white hover:bg-white/10 transition-colors gap-2"
                              >
                                <div className="w-4 flex justify-center">
                                  {currentQuality === -1 && <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-400" />}
                                </div>
                                <div className="flex-1">
                                  <span className="font-medium">Auto</span>
                                  <span className="text-gray-400 ml-1.5 text-[10px]">Adaptive</span>
                                </div>
                              </button>

                              {/* Quality levels - sorted highest first */}
                              {qualities.map((level) => (
                                <button
                                  key={level.index}
                                  onClick={(e) => { e.stopPropagation(); handleQualityChange(level.index); }}
                                  className="flex items-center w-full text-left px-3 py-1.5 sm:py-2 text-xs text-white hover:bg-white/10 transition-colors gap-2"
                                >
                                  <div className="w-4 flex justify-center">
                                    {currentQuality === level.index && <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-400" />}
                                  </div>
                                  <div className="flex-1 flex items-center gap-1.5">
                                    <span className="font-medium">{getQualityLabel(level.height)}</span>
                                    {level.height >= 720 && (
                                      <span className="text-[8px] sm:text-[9px] font-bold bg-blue-500 text-white px-1 py-0.5 rounded">HD</span>
                                    )}
                                    {level.height >= 2160 && (
                                      <span className="text-[8px] sm:text-[9px] font-bold bg-purple-500 text-white px-1 py-0.5 rounded">4K</span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-gray-500 hidden sm:inline">
                                    {formatBitrate(level.bitrate)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Mute toggle (mobile) */}
                    <button onClick={toggleMute} className="text-white hover:text-white/80 transition-colors p-1 sm:hidden">
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>

                    {/* Rotate Toggle */}
                    <button 
                      onClick={toggleRotation} 
                      className="text-white hover:text-white/80 transition-colors p-1"
                      title="Rotate Video"
                    >
                      <RotateCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </button>

                    {/* Fullscreen */}
                    <button onClick={toggleFullscreen} className="text-white hover:text-white/80 transition-colors p-1">
                      {isFullscreen
                        ? <Minimize className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        : <Maximize className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Chat/Feedback Section */}
        <div className="flex-1 md:flex-none md:w-80 lg:w-96 flex flex-col bg-white border-t md:border-t-0 md:border-l border-gray-200 h-full min-h-0 relative z-0">

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
