import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { publicVideoService } from '@/services/api.service';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, Check, Loader2, ShieldX } from 'lucide-react';

export default function ShareVideoPlayer() {
  const { videoId } = useParams<{ videoId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || undefined;
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout>>();

  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [qualities, setQualities] = useState<{ index: number; height: number; width: number; bitrate: number }[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [videoLoading, setVideoLoading] = useState(true);

  useEffect(() => {
    if (videoId) loadVideo();
    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
    };
  }, [videoId]);

  // Poll for processing status
  useEffect(() => {
    if (!videoId || !processing) return;
    const interval = setInterval(async () => {
      try {
        const data = await publicVideoService.getVideoInfo(videoId!, token);
        if (data.hls_ready) {
          setVideo(data);
          setProcessing(false);
          setTimeout(() => initPlayer(data), 100);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [videoId, processing, token]);

  // Fullscreen listener
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
      setError('Invalid share link. A valid share token is required to access this video.');
      setLoading(false);
      return;
    }
    try {
      const data = await publicVideoService.getVideoInfo(videoId!, token);
      setVideo(data);
      if (!data.hls_ready) {
        setProcessing(true);
      } else {
        initPlayer(data);
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

    if (!videoData.hls_ready) {
      setProcessing(true);
      return;
    }

    setVideoLoading(true);
    setQualities([]);
    setCurrentQuality(-1);

    if (Hls.isSupported()) {
      const hlsUrl = publicVideoService.getHLSUrl(videoData.id, token);
      const hls = new Hls({
        startLevel: -1,
        enableWorker: true,
        capLevelToPlayerSize: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000,
        startFragPrefetch: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        testBandwidth: true,
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

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setVideoLoading(false);
        const levels = data.levels
          .map((level, i) => ({
            index: i,
            height: level.height,
            width: level.width,
            bitrate: level.bitrate,
          }))
          .sort((a, b) => b.height - a.height);
        setQualities(levels);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentQuality(data.level);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setError('Failed to load video stream.');
          }
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = publicVideoService.getHLSUrl(videoData.id, token);
      videoEl.addEventListener('loadedmetadata', () => setVideoLoading(false), { once: true });
    } else {
      setError('Your browser does not support HLS video playback.');
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
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, []);

  const handleQualityChange = useCallback((levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setCurrentQuality(levelIndex);
    }
    setShowQualityMenu(false);
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

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = percent * v.duration;
  }, []);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

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

  // --- Render states ---

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
          <p className="text-white/60 text-sm">Loading video...</p>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-[100dvh] bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            {!token ? <ShieldX className="h-8 w-8 text-red-400" /> : <Play className="h-8 w-8 text-red-400" />}
          </div>
          <h1 className="text-xl font-bold text-white mb-2">
            {!token ? 'Access Denied' : 'Video Unavailable'}
          </h1>
          <p className="text-gray-400 text-sm max-w-md">{error || 'This video could not be loaded.'}</p>
        </div>
      </div>
    );
  }

  if (processing) {
    return (
      <div className="min-h-[100dvh] bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-[3px] border-gray-600 border-t-blue-400 rounded-full animate-spin mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Processing Video</h1>
          <p className="text-gray-400 text-sm max-w-md">
            This video is still being processed. Please check back shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-black flex flex-col">
      {/* Brand Header */}
      <div className="bg-gray-950 border-b border-gray-800 px-3 sm:px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white font-bold text-sm tracking-tight">ReviewFlow</span>
          <span className="text-gray-600 text-xs">|</span>
          <span className="text-gray-400 text-xs truncate max-w-[150px] sm:max-w-none">{video.filename}</span>
        </div>
        {video.status && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 font-medium flex-shrink-0">
            {video.status}
          </span>
        )}
      </div>

      {/* Video Player */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-black flex items-center justify-center cursor-pointer group"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { if (isPlaying) setShowControls(false); }}
      >
        {videoLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
              <p className="text-gray-400 text-sm">Loading video...</p>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          onClick={togglePlay}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onLoadedMetadata={() => setVideoLoading(false)}
          onWaiting={() => setVideoLoading(true)}
          onPlaying={() => setVideoLoading(false)}
          playsInline
        />

        {/* Center Play Overlay */}
        {!isPlaying && !videoLoading && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/20"
            onClick={togglePlay}
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-all duration-300 hover:scale-110 active:scale-95">
              <Play className="h-8 w-8 sm:h-10 sm:w-10 text-white ml-1" />
            </div>
          </div>
        )}

        {/* Bottom Controls */}
        <div
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 sm:px-4 pb-3 sm:pb-4 pt-12 transition-opacity duration-300 z-20 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress Bar */}
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
            <div className="flex items-center gap-1.5 sm:gap-2.5">
              <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="text-white hover:text-white/80 transition-colors p-1">
                {isPlaying ? <Pause className="h-4 w-4 sm:h-5 sm:w-5" /> : <Play className="h-4 w-4 sm:h-5 sm:w-5" />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="text-white hover:text-white/80 transition-colors p-1 hidden sm:block">
                {isMuted ? <VolumeX className="h-4 w-4 sm:h-5 sm:w-5" /> : <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />}
              </button>
              <span className="text-white text-[10px] sm:text-xs font-mono tabular-nums">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {/* Quality Selector */}
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

                        {qualities.map((q) => (
                          <button
                            key={q.index}
                            onClick={(e) => { e.stopPropagation(); handleQualityChange(q.index); }}
                            className="flex items-center w-full text-left px-3 py-1.5 sm:py-2 text-xs text-white hover:bg-white/10 transition-colors gap-2"
                          >
                            <div className="w-4 flex justify-center">
                              {currentQuality === q.index && <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-400" />}
                            </div>
                            <div className="flex-1 flex items-center gap-1.5">
                              <span className="font-medium">{getQualityLabel(q.height)}</span>
                              {q.height >= 720 && (
                                <span className="text-[8px] sm:text-[9px] font-bold bg-blue-500 text-white px-1 py-0.5 rounded">HD</span>
                              )}
                              {q.height >= 2160 && (
                                <span className="text-[8px] sm:text-[9px] font-bold bg-purple-500 text-white px-1 py-0.5 rounded">4K</span>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-500 hidden sm:inline">
                              {formatBitrate(q.bitrate)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Mute (mobile) */}
              <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="text-white hover:text-white/80 transition-colors p-1 sm:hidden">
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>

              {/* Fullscreen */}
              <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className="text-white hover:text-white/80 transition-colors p-1">
                {isFullscreen
                  ? <Minimize className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  : <Maximize className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
