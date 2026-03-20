import { useState, useRef, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import { Settings, Check, Download, Play, Pause, Maximize, Minimize, Volume2, VolumeX, SkipForward, SkipBack, RotateCcw, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HLSPlayerProps {
  hlsUrl: string;
  fallbackUrl: string;
  downloadUrl?: string;
  onProgress?: (state: { played: number; playedSeconds: number }) => void;
  onPlayerRef?: (ref: { seekTo: (time: number) => void; pause: () => void }) => void;
  onPlayingChange?: (playing: boolean) => void;
  onPlayerError?: () => void;
}

export default function HLSPlayer({ hlsUrl, fallbackUrl, downloadUrl, onProgress, onPlayerRef, onPlayingChange, onPlayerError }: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout>>();
  const progressBarRef = useRef<HTMLDivElement>(null);

  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [levels, setLevels] = useState<{ height: number; width: number; bitrate: number; index: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [showQuality, setShowQuality] = useState(false);

  // Custom controls state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isPortrait, setIsPortrait] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [introShown, setIntroShown] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isLandscapeLocked, setIsLandscapeLocked] = useState(true);

  // Double-tap state
  const [skipIndicator, setSkipIndicator] = useState<{ side: 'left' | 'right'; key: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });

  const isMobile = useRef(false);
  useEffect(() => {
    isMobile.current = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
  }, []);

  const seekTo = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }, []);

  const pause = useCallback(() => {
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, []);

  useEffect(() => {
    if (onPlayerRef) {
      onPlayerRef({ seekTo, pause });
    }
  }, [onPlayerRef, seekTo, pause]);

  // Notify parent about play/pause state changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => { setIsPlaying(true); onPlayingChange?.(true); };
    const handlePause = () => { setIsPlaying(false); onPlayingChange?.(false); };
    const handleEnded = () => { setIsPlaying(false); onPlayingChange?.(false); };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onPlayingChange]);

  // HLS setup
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      let mediaErrorRecovered = false;
      let isCleaningUp = false;

      const hls = new Hls({
        enableWorker: true,
        startLevel: -1,
        capLevelToPlayerSize: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startFragPrefetch: true,
        manifestLoadingMaxRetry: 2,
        levelLoadingMaxRetry: 2,
        fragLoadingMaxRetry: 3,
        xhrSetup: function(xhr) {
          const token = localStorage.getItem('token');
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
        }
      });

      const loadingTimeout = setTimeout(() => {
        if (video.readyState === 0) {
          console.warn('HLS manifest load timeout, falling back to direct stream');
          isCleaningUp = true;
          hls.destroy();
          video.src = fallbackUrl;
          setLoading(false);
          setLevels([]);
        }
      }, 20000);

      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        if (isCleaningUp) return;
        clearTimeout(loadingTimeout);
        setLoading(false);
        const qualityLevels = data.levels
          .map((level, index) => ({
            height: level.height,
            width: level.width,
            bitrate: level.bitrate,
            index,
          }))
          .sort((a, b) => b.height - a.height);
        setLevels(qualityLevels);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        if (isCleaningUp) return;
        setCurrentLevel(data.level);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (isCleaningUp) return;
        console.error('HLS error:', data.type, data.details, data.fatal);
        if (data.fatal) {
          clearTimeout(loadingTimeout);
          isCleaningUp = true;
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('HLS fatal network error, falling back to direct stream');
              hls.destroy();
              video.src = fallbackUrl;
              setLoading(false);
              setLevels([]);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              isCleaningUp = false;
              if (!mediaErrorRecovered) {
                console.warn('HLS media error, attempting one recovery');
                mediaErrorRecovered = true;
                hls.recoverMediaError();
              } else {
                isCleaningUp = true;
                console.error('HLS media error unrecoverable, falling back to direct stream');
                hls.destroy();
                video.src = fallbackUrl;
                setLoading(false);
                setLevels([]);
              }
              break;
            default:
              console.error('HLS unrecoverable error, falling back to direct stream');
              hls.destroy();
              video.src = fallbackUrl;
              setLoading(false);
              setLevels([]);
              break;
          }
        }
      });

      hlsRef.current = hls;

      return () => {
        isCleaningUp = true;
        clearTimeout(loadingTimeout);
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
      video.addEventListener('loadedmetadata', () => setLoading(false));
    } else {
      video.src = fallbackUrl;
      video.addEventListener('loadedmetadata', () => setLoading(false));
    }
  }, [hlsUrl, fallbackUrl]);

  // Progress tracking for parent
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !onProgress) return;

    const interval = setInterval(() => {
      if (video.duration) {
        onProgress({
          played: video.currentTime / video.duration,
          playedSeconds: video.currentTime,
        });
      }
    }, 500);

    return () => clearInterval(interval);
  }, [onProgress]);

  // Close quality menu on outside click
  useEffect(() => {
    if (!showQuality) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.quality-panel')) {
        setShowQuality(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showQuality]);

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      // Unlock orientation when exiting fullscreen
      if (!fs && screen.orientation && 'unlock' in screen.orientation) {
        try { screen.orientation.unlock(); } catch {}
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Time update handler
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    setDuration(v.duration || 0);
    if (v.buffered.length > 0) {
      setBuffered(v.buffered.end(v.buffered.length - 1));
    }
  }, []);

  // Controls auto-hide
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  const enterFullscreen = useCallback(async () => {
    if (!containerRef.current || document.fullscreenElement) return;
    try {
      await containerRef.current.requestFullscreen();
      // Lock to landscape on mobile
      if (isMobile.current && isLandscapeLocked && screen.orientation && 'lock' in screen.orientation) {
        try { await screen.orientation.lock('landscape'); } catch {}
      }
    } catch {}
  }, [isLandscapeLocked]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (!introShown) {
        setShowIntro(true);
        setIntroShown(true);
        // Auto-enter fullscreen on first play
        enterFullscreen();
        setTimeout(() => {
          setShowIntro(false);
          v.play();
        }, 3000);
      } else {
        v.play();
        // Auto-enter fullscreen on play
        enterFullscreen();
      }
    } else {
      v.pause();
    }
  }, [introShown, enterFullscreen]);

  const skipForward = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(v.duration || 0, v.currentTime + 10);
  }, []);

  const skipBackward = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, v.currentTime - 10);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target !== document.body) return;
      const video = videoRef.current;
      if (!video) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        skipForward();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        skipBackward();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [togglePlay, skipForward, skipBackward]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      try {
        await containerRef.current.requestFullscreen();
        if (isMobile.current && isLandscapeLocked && screen.orientation && 'lock' in screen.orientation) {
          try { await screen.orientation.lock('landscape'); } catch {}
        }
      } catch {}
    }
  }, [isLandscapeLocked]);

  const toggleOrientation = useCallback(async () => {
    if (!screen.orientation || !('lock' in screen.orientation)) return;
    const newLocked = !isLandscapeLocked;
    setIsLandscapeLocked(newLocked);
    if (document.fullscreenElement) {
      try {
        if (newLocked) {
          await screen.orientation.lock('landscape');
        } else {
          await screen.orientation.lock('portrait');
        }
      } catch {}
    }
  }, [isLandscapeLocked]);

  // Progress bar seeking with drag support
  const seekFromEvent = useCallback((clientX: number) => {
    const bar = progressBarRef.current;
    const v = videoRef.current;
    if (!bar || !v || !v.duration) return;
    const rect = bar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    v.currentTime = percent * v.duration;
  }, []);

  const handleSeekMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsSeeking(true);
    seekFromEvent(e.clientX);

    const handleMouseMove = (ev: MouseEvent) => {
      seekFromEvent(ev.clientX);
    };
    const handleMouseUp = () => {
      setIsSeeking(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [seekFromEvent]);

  const handleSeekTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsSeeking(true);
    seekFromEvent(e.touches[0].clientX);

    const handleTouchMove = (ev: TouchEvent) => {
      ev.preventDefault();
      seekFromEvent(ev.touches[0].clientX);
    };
    const handleTouchEnd = () => {
      setIsSeeking(false);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
  }, [seekFromEvent]);

  // Double-tap to skip on mobile
  const handleVideoTap = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    // Don't handle taps on controls area
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('.quality-panel') || target.closest('[data-controls]')) return;

    const now = Date.now();
    const touch = e.changedTouches[0];
    const timeDiff = now - lastTapRef.current.time;
    const xDiff = Math.abs(touch.clientX - lastTapRef.current.x);

    if (timeDiff < 300 && xDiff < 50) {
      // Double tap detected
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const tapX = touch.clientX - rect.left;
      const halfWidth = rect.width / 2;

      if (tapX > halfWidth) {
        // Right side - skip forward
        skipForward();
        setSkipIndicator({ side: 'right', key: now });
      } else {
        // Left side - skip backward
        skipBackward();
        setSkipIndicator({ side: 'left', key: now });
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      lastTapRef.current = { time: now, x: touch.clientX };
    }
  }, [skipForward, skipBackward]);

  // Touch controls: show/hide on single tap, but wait to confirm it's not a double-tap
  const singleTapTimer = useRef<ReturnType<typeof setTimeout>>();
  const handleVideoTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('.quality-panel') || target.closest('[data-controls]')) return;

    handleVideoTap(e);

    // Delayed single-tap action (toggle controls)
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => {
      // Only fires if wasn't a double-tap
      if (Date.now() - lastTapRef.current.time > 300 || lastTapRef.current.time === 0) {
        setShowControls(prev => !prev);
      }
    }, 320);
  }, [handleVideoTap]);

  const setQuality = (levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
    setShowQuality(false);
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
    if (height >= 240) return '240p';
    return `${height}p`;
  };

  const formatBitrate = (bitrate: number) => {
    if (bitrate >= 1000000) return `${(bitrate / 1000000).toFixed(1)} Mbps`;
    return `${Math.round(bitrate / 1000)} Kbps`;
  };

  const getCurrentQualityLabel = () => {
    if (currentLevel === -1 || !levels.length) return 'Auto';
    const level = levels.find(l => l.index === currentLevel);
    if (!level) return 'Auto';
    return getQualityLabel(level.height);
  };

  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full bg-gray-950 rounded-lg overflow-hidden relative group select-none",
        isFullscreen ? "rounded-none" : "",
        isPortrait && !isFullscreen ? "max-h-[75vh]" : ""
      )}
      style={!isFullscreen ? { aspectRatio: isPortrait ? '9/16' : '16/9', maxHeight: isPortrait ? '75vh' : undefined } : undefined}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { if (isPlaying) setShowControls(false); }}
      onTouchEnd={handleVideoTouchEnd}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 z-10">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Loading video...</p>
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        className={cn(
          "w-full h-full cursor-pointer",
          isFullscreen ? "object-contain" : "object-contain"
        )}
        playsInline
        controlsList="nodownload"
        onClick={(e) => {
          // On desktop, toggle play on click (not on mobile, handled by touch)
          if (!isMobile.current) {
            togglePlay();
          }
        }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          setLoading(false);
          const v = videoRef.current;
          if (v && v.videoWidth && v.videoHeight) {
            setIsPortrait(v.videoHeight > v.videoWidth);
          }
        }}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onError={() => {
          setError(true);
          setLoading(false);
          if (onPlayerError) onPlayerError();
        }}
      />

      {/* Digitech Intro Overlay - 3 seconds with graphics */}
      {showIntro && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-30 overflow-hidden">
          {/* Background particles */}
          <div className="absolute inset-0">
            <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl animate-intro-particles" />
            <div className="absolute bottom-1/3 right-1/4 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl animate-intro-particles" style={{ animationDelay: '0.3s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/5 rounded-full blur-3xl animate-intro-particles" style={{ animationDelay: '0.1s' }} />
          </div>
          <div className="text-center relative z-10">
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-white tracking-wider animate-intro-glow">
              <span className="bg-gradient-to-r from-white via-blue-200 to-white bg-clip-text text-transparent">
                Digitech
              </span>
            </h1>
            <div className="mt-4 h-0.5 bg-gradient-to-r from-transparent via-white/60 to-transparent mx-auto rounded-full animate-intro-line" />
            <p className="mt-3 text-sm sm:text-base text-white/50 tracking-[0.3em] uppercase animate-intro-subtitle">
              Video Player
            </p>
          </div>
        </div>
      )}

      {/* Double-tap skip indicator */}
      {skipIndicator && (
        <div
          key={skipIndicator.key}
          className={cn(
            "absolute top-0 bottom-0 flex items-center justify-center pointer-events-none z-25",
            skipIndicator.side === 'right' ? 'right-0 w-1/3' : 'left-0 w-1/3'
          )}
        >
          <div className="flex flex-col items-center animate-skip-ripple">
            <div className="bg-white/20 rounded-full p-4 backdrop-blur-sm">
              {skipIndicator.side === 'right' ? (
                <SkipForward className="h-8 w-8 text-white" />
              ) : (
                <SkipBack className="h-8 w-8 text-white" />
              )}
            </div>
            <span className="text-white text-sm font-bold mt-1">10s</span>
          </div>
        </div>
      )}

      {/* Center play overlay when paused */}
      {!isPlaying && !loading && !error && !showIntro && (
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
      {!error && (
        <div
          data-controls="true"
          className={cn(
            "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-3 sm:px-4 pb-2.5 sm:pb-3 pt-12 transition-opacity duration-300 z-20",
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* Progress bar - draggable */}
          <div
            ref={progressBarRef}
            className={cn(
              "w-full bg-white/20 rounded-full mb-2.5 cursor-pointer group/bar relative touch-none",
              isSeeking ? "h-2 sm:h-2.5" : "h-1 sm:h-1.5"
            )}
            onMouseDown={handleSeekMouseDown}
            onTouchStart={handleSeekTouchStart}
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
              className={cn(
                "absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white rounded-full shadow-lg transition-opacity",
                isSeeking ? "opacity-100 scale-110" : "opacity-0 group-hover/bar:opacity-100"
              )}
              style={{ left: duration ? `calc(${(currentTime / duration) * 100}% - 7px)` : '0' }}
            />
          </div>

          <div className="flex items-center justify-between gap-1 sm:gap-2">
            {/* Left controls */}
            <div className="flex items-center gap-1 sm:gap-2.5">
              <button onClick={togglePlay} className="text-white hover:text-white/80 transition-colors p-1">
                {isPlaying ? <Pause className="h-4 w-4 sm:h-5 sm:w-5" /> : <Play className="h-4 w-4 sm:h-5 sm:w-5" />}
              </button>
              <button onClick={skipBackward} className="text-white hover:text-white/80 transition-colors p-1 hidden sm:block" title="Skip back 10s">
                <div className="relative">
                  <SkipBack className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[7px] sm:text-[8px] font-bold">10</span>
                </div>
              </button>
              <button onClick={skipForward} className="text-white hover:text-white/80 transition-colors p-1 hidden sm:block" title="Skip forward 10s">
                <div className="relative">
                  <SkipForward className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[7px] sm:text-[8px] font-bold">10</span>
                </div>
              </button>
              <button onClick={toggleMute} className="text-white hover:text-white/80 transition-colors p-1 hidden sm:block">
                {isMuted ? <VolumeX className="h-4 w-4 sm:h-5 sm:w-5" /> : <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />}
              </button>
              <span className="text-white text-[9px] sm:text-xs font-mono tabular-nums whitespace-nowrap">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-0.5 sm:gap-2">
              {/* Download */}
              {downloadUrl && (
                <button
                  onClick={handleDownload}
                  className="text-white hover:text-white/80 transition-colors p-1 hidden sm:block"
                  title="Download Original"
                >
                  <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
              )}

              {/* Quality selector */}
              {levels.length > 0 && (
                <div className="relative quality-panel">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowQuality(!showQuality);
                    }}
                    className="flex items-center gap-0.5 sm:gap-1.5 bg-white/10 hover:bg-white/20 text-white text-[9px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1.5 rounded-md sm:rounded-lg font-medium backdrop-blur-sm transition-all"
                  >
                    <Settings className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden xs:inline">{getCurrentQualityLabel()}</span>
                  </button>

                  {showQuality && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setShowQuality(false); }} />
                      <div className="absolute bottom-9 sm:bottom-10 right-0 bg-gray-900/95 backdrop-blur-md rounded-lg sm:rounded-xl py-1 sm:py-1.5 min-w-[140px] sm:min-w-[200px] z-50 shadow-2xl border border-gray-700/50 overflow-hidden max-h-[50vh] overflow-y-auto">
                        <div className="px-3 py-1 sm:py-1.5 text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700/50 mb-0.5 sm:mb-1">
                          Video Quality
                        </div>

                        <button
                          onClick={(e) => { e.stopPropagation(); setQuality(-1); }}
                          className="flex items-center w-full text-left px-3 py-1.5 sm:py-2 text-xs text-white hover:bg-white/10 transition-colors gap-2"
                        >
                          <div className="w-4 flex justify-center">
                            {currentLevel === -1 && <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-400" />}
                          </div>
                          <div className="flex-1">
                            <span className="font-medium">Auto</span>
                            <span className="text-gray-400 ml-1.5 text-[10px]">Adaptive</span>
                          </div>
                        </button>

                        {levels.map((level) => (
                          <button
                            key={level.index}
                            onClick={(e) => { e.stopPropagation(); setQuality(level.index); }}
                            className="flex items-center w-full text-left px-3 py-1.5 sm:py-2 text-xs text-white hover:bg-white/10 transition-colors gap-2"
                          >
                            <div className="w-4 flex justify-center">
                              {currentLevel === level.index && <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-400" />}
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
                {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>

              {/* Orientation toggle (visible in fullscreen on mobile) */}
              {isFullscreen && (
                <button
                  onClick={toggleOrientation}
                  className="text-white hover:text-white/80 transition-colors p-1"
                  title={isLandscapeLocked ? 'Switch to portrait' : 'Switch to landscape'}
                >
                  {isLandscapeLocked ? (
                    <Smartphone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  ) : (
                    <Smartphone className="h-3.5 w-3.5 sm:h-4 sm:w-4 rotate-90" />
                  )}
                </button>
              )}

              {/* Fullscreen */}
              <button onClick={toggleFullscreen} className="text-white hover:text-white/80 transition-colors p-1">
                {isFullscreen
                  ? <Minimize className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  : <Maximize className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 z-10">
          <div className="text-center">
            <p className="text-red-400 text-sm mb-3">Failed to load video</p>
            <button
              onClick={() => {
                setError(false);
                setLoading(true);
                if (videoRef.current) {
                  videoRef.current.src = fallbackUrl;
                  videoRef.current.load();
                }
              }}
              className="text-sm text-gray-300 hover:text-white px-4 py-1.5 border border-gray-600 rounded-md transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
