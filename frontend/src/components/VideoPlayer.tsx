import { useState, useRef, useEffect, useCallback } from 'react';
import ReactPlayer from 'react-player';
import { Download, SkipForward, SkipBack } from 'lucide-react';

interface VideoPlayerProps {
  url: string;
  filename?: string;
  downloadUrl?: string;
  onProgress?: (state: { played: number; playedSeconds: number }) => void;
  playerRef?: React.RefObject<ReactPlayer>;
  onPlayingChange?: (playing: boolean) => void;
}

export default function VideoPlayer({ url, downloadUrl, onProgress, playerRef, onPlayingChange }: VideoPlayerProps) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [introShown, setIntroShown] = useState(false);
  const internalPlayerRef = useRef<ReactPlayer>(null);
  const activePlayerRef = playerRef || internalPlayerRef;

  const handlePlay = useCallback(() => {
    if (!introShown) {
      setShowIntro(true);
      setIntroShown(true);
      setTimeout(() => {
        setShowIntro(false);
        setPlaying(true);
      }, 1500);
    } else {
      setPlaying(true);
    }
  }, [introShown]);

  const skipForward = useCallback(() => {
    const player = activePlayerRef.current;
    if (player) {
      const current = player.getCurrentTime();
      const duration = player.getDuration();
      player.seekTo(Math.min(duration, current + 10), 'seconds');
    }
  }, [activePlayerRef]);

  const skipBackward = useCallback(() => {
    const player = activePlayerRef.current;
    if (player) {
      const current = player.getCurrentTime();
      player.seekTo(Math.max(0, current - 10), 'seconds');
    }
  }, [activePlayerRef]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target !== document.body) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (playing) {
          setPlaying(false);
        } else {
          handlePlay();
        }
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
  }, [playing, handlePlay, skipForward, skipBackward]);

  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
    }
  };

  return (
    <div className="w-full aspect-video bg-gray-950 rounded-lg overflow-hidden relative group">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 z-10">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Loading video...</p>
          </div>
        </div>
      )}

      {/* Digitech Intro Overlay */}
      {showIntro && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-30 animate-fade-in">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-wider animate-pulse">
              Digitech
            </h1>
            <div className="mt-4 w-12 h-0.5 bg-white/40 mx-auto rounded-full" />
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
              }}
              className="text-sm text-gray-300 hover:text-white px-4 py-1.5 border border-gray-600 rounded-md transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Download button overlay */}
      {downloadUrl && (
        <div className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={handleDownload}
            className="bg-black/70 hover:bg-black/90 text-white p-2 rounded-lg backdrop-blur-sm transition-all hover:scale-105 shadow-lg"
            title="Download Original (Highest Quality)"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Skip controls overlay */}
      <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={skipBackward}
          className="bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-full backdrop-blur-sm transition-all hover:scale-110 active:scale-95 shadow-lg"
          title="Skip back 10s"
        >
          <div className="relative">
            <SkipBack className="h-5 w-5" />
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[8px] font-bold">10</span>
          </div>
        </button>
        <button
          onClick={skipForward}
          className="bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-full backdrop-blur-sm transition-all hover:scale-110 active:scale-95 shadow-lg"
          title="Skip forward 10s"
        >
          <div className="relative">
            <SkipForward className="h-5 w-5" />
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[8px] font-bold">10</span>
          </div>
        </button>
      </div>

      <ReactPlayer
        ref={activePlayerRef}
        url={url}
        controls
        width="100%"
        height="100%"
        playing={playing}
        onReady={() => setLoading(false)}
        onError={() => {
          setError(true);
          setLoading(false);
        }}
        onPlay={() => { setPlaying(true); onPlayingChange?.(true); }}
        onPause={() => { setPlaying(false); onPlayingChange?.(false); }}
        onProgress={onProgress}
        progressInterval={500}
        config={{
          file: {
            attributes: {
              controlsList: 'nodownload',
            }
          }
        }}
      />
    </div>
  );
}
