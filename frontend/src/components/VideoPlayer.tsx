import { useState, useRef, useEffect } from 'react';
import ReactPlayer from 'react-player';

interface VideoPlayerProps {
  url: string;
  filename?: string;
  onProgress?: (state: { played: number; playedSeconds: number }) => void;
  playerRef?: React.RefObject<ReactPlayer>;
}

export default function VideoPlayer({ url, filename, onProgress, playerRef }: VideoPlayerProps) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const internalPlayerRef = useRef<ReactPlayer>(null);
  const activePlayerRef = playerRef || internalPlayerRef;

  // Space bar to play/pause
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        setPlaying(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <div className="w-full aspect-video bg-black rounded-lg overflow-hidden relative">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
          <p className="text-white">Loading video...</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
          <div className="text-center">
            <p className="text-red-400 mb-2">Failed to load video</p>
            <button
              onClick={() => {
                setError(false);
                setLoading(true);
              }}
              className="text-white underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}
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
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onProgress={onProgress}
        progressInterval={1000}
        config={{
          file: {
            attributes: {
              controlsList: 'nodownload',
              crossOrigin: 'anonymous'
            }
          }
        }}
      />
      <div className="absolute bottom-16 left-4 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded z-20">
        Press <kbd className="bg-white text-black px-1 rounded">Space</kbd> to play/pause
      </div>
    </div>
  );
}
