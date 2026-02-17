import { useState, useRef, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import { Settings, Check, Download } from 'lucide-react';

interface HLSPlayerProps {
  hlsUrl: string;
  fallbackUrl: string;
  downloadUrl?: string;
  onProgress?: (state: { played: number; playedSeconds: number }) => void;
  onPlayerRef?: (ref: { seekTo: (time: number) => void; pause: () => void }) => void;
  onPlayingChange?: (playing: boolean) => void;
}

export default function HLSPlayer({ hlsUrl, fallbackUrl, downloadUrl, onProgress, onPlayerRef, onPlayingChange }: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [levels, setLevels] = useState<{ height: number; width: number; bitrate: number; index: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [showQuality, setShowQuality] = useState(false);

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
    if (!video || !onPlayingChange) return;

    const handlePlay = () => onPlayingChange(true);
    const handlePause = () => onPlayingChange(false);
    const handleEnded = () => onPlayingChange(false);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onPlayingChange]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        startLevel: -1, // auto
      });

      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setLoading(false);
        const qualityLevels = data.levels
          .map((level, index) => ({
            height: level.height,
            width: level.width,
            bitrate: level.bitrate,
            index,
          }))
          .sort((a, b) => b.height - a.height); // Sort highest first
        setLevels(qualityLevels);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentLevel(data.level);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.warn('HLS fatal error, falling back to direct stream');
          hls.destroy();
          video.src = fallbackUrl;
          setLoading(false);
          setLevels([]);
        }
      });

      hlsRef.current = hls;

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = hlsUrl;
      video.addEventListener('loadedmetadata', () => setLoading(false));
    } else {
      // Fallback to direct stream
      video.src = fallbackUrl;
      video.addEventListener('loadedmetadata', () => setLoading(false));
    }
  }, [hlsUrl, fallbackUrl]);

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

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        const video = videoRef.current;
        if (video) {
          video.paused ? video.play() : video.pause();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

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

  const setQuality = (levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
    setShowQuality(false);
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

  const getQualityBadge = (height: number) => {
    if (height >= 1080) return 'HD';
    if (height >= 720) return 'HD';
    return 'SD';
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
    <div className="w-full aspect-video bg-gray-950 rounded-lg overflow-hidden relative group">
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
        controls
        className="w-full h-full"
        controlsList="nodownload"
        onError={() => {
          setError(true);
          setLoading(false);
        }}
      />

      {/* Top-right controls overlay — always visible on mobile, hover on desktop */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
        {/* Download button on player */}
        {downloadUrl && (
          <button
            onClick={handleDownload}
            className="bg-black/70 hover:bg-black/90 text-white p-2 rounded-lg backdrop-blur-sm transition-all hover:scale-105 shadow-lg"
            title="Download Original (Highest Quality)"
          >
            <Download className="h-4 w-4" />
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
              className="flex items-center gap-1.5 bg-black/70 hover:bg-black/90 text-white text-xs px-3 py-2 rounded-lg font-medium backdrop-blur-sm transition-all shadow-lg"
              title="Video quality"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>{getCurrentQualityLabel()}</span>
              {currentLevel >= 0 && levels.find(l => l.index === currentLevel)?.height && (
                <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                  (levels.find(l => l.index === currentLevel)?.height || 0) >= 720
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-500 text-white'
                }`}>
                  {getQualityBadge(levels.find(l => l.index === currentLevel)?.height || 0)}
                </span>
              )}
            </button>

            {showQuality && (
              <div className="absolute right-0 top-11 bg-gray-900/95 backdrop-blur-md rounded-xl py-1.5 min-w-[200px] z-40 shadow-2xl border border-gray-700/50 overflow-hidden">
                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700/50 mb-1">
                  Video Quality
                </div>

                {/* Auto option */}
                <button
                  onClick={() => setQuality(-1)}
                  className={`flex items-center w-full text-left px-3 py-2 text-xs text-white hover:bg-white/10 transition-colors gap-2`}
                >
                  <div className="w-4 flex justify-center">
                    {currentLevel === -1 && <Check className="h-3.5 w-3.5 text-blue-400" />}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium">Auto</span>
                    <span className="text-gray-400 ml-1.5 text-[10px]">Adaptive</span>
                  </div>
                </button>

                {/* Quality levels - sorted highest first */}
                {levels.map((level) => (
                  <button
                    key={level.index}
                    onClick={() => setQuality(level.index)}
                    className={`flex items-center w-full text-left px-3 py-2 text-xs text-white hover:bg-white/10 transition-colors gap-2`}
                  >
                    <div className="w-4 flex justify-center">
                      {currentLevel === level.index && <Check className="h-3.5 w-3.5 text-blue-400" />}
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="font-medium">{getQualityLabel(level.height)}</span>
                      {level.height >= 720 && (
                        <span className="text-[9px] font-bold bg-blue-500 text-white px-1 py-0.5 rounded">
                          HD
                        </span>
                      )}
                      {level.height >= 2160 && (
                        <span className="text-[9px] font-bold bg-purple-500 text-white px-1 py-0.5 rounded">
                          4K
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500">
                      {formatBitrate(level.bitrate)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

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
