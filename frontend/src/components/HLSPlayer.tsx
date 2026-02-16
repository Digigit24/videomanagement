import { useState, useRef, useEffect, useCallback } from 'react';
import Hls from 'hls.js';

interface HLSPlayerProps {
  hlsUrl: string;
  fallbackUrl: string;
  onProgress?: (state: { played: number; playedSeconds: number }) => void;
  onPlayerRef?: (ref: { seekTo: (time: number) => void }) => void;
}

export default function HLSPlayer({ hlsUrl, fallbackUrl, onProgress, onPlayerRef }: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [levels, setLevels] = useState<{ height: number; index: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [showQuality, setShowQuality] = useState(false);

  const seekTo = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }, []);

  useEffect(() => {
    if (onPlayerRef) {
      onPlayerRef({ seekTo });
    }
  }, [onPlayerRef, seekTo]);

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
        const qualityLevels = data.levels.map((level, index) => ({
          height: level.height,
          index,
        }));
        setLevels(qualityLevels);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentLevel(data.level);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          // Fall back to direct stream
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

  const setQuality = (levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
    setShowQuality(false);
  };

  const getQualityLabel = (height: number) => {
    if (height >= 2160) return '4K';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    return `${height}p`;
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

      {/* Quality selector */}
      {levels.length > 1 && (
        <div className="absolute top-3 right-3 z-20">
          <div className="relative">
            <button
              onClick={() => setShowQuality(!showQuality)}
              className="bg-black/70 text-white text-xs px-2.5 py-1.5 rounded font-medium hover:bg-black/90 transition-colors opacity-0 group-hover:opacity-100"
            >
              {currentLevel >= 0 ? getQualityLabel(levels[currentLevel]?.height || 0) : 'Auto'}
            </button>

            {showQuality && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowQuality(false)} />
                <div className="absolute right-0 top-9 bg-black/90 rounded-lg py-1 min-w-[100px] z-40">
                  <button
                    onClick={() => setQuality(-1)}
                    className={`block w-full text-left px-3 py-1.5 text-xs text-white hover:bg-white/10 ${currentLevel === -1 ? 'font-bold' : ''}`}
                  >
                    Auto
                  </button>
                  {levels.map((level) => (
                    <button
                      key={level.index}
                      onClick={() => setQuality(level.index)}
                      className={`block w-full text-left px-3 py-1.5 text-xs text-white hover:bg-white/10 ${currentLevel === level.index ? 'font-bold' : ''}`}
                    >
                      {getQualityLabel(level.height)}
                    </button>
                  ))}
                </div>
              </>
            )}
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
