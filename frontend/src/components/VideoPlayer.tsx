import { useState, useRef, useEffect } from 'react';
import ReactPlayer from 'react-player';
import { Download } from 'lucide-react';

interface VideoPlayerProps {
  url: string;
  filename?: string;
  downloadUrl?: string;
  onProgress?: (state: { played: number; playedSeconds: number }) => void;
  playerRef?: React.RefObject<ReactPlayer>;
}

export default function VideoPlayer({ url, downloadUrl, onProgress, playerRef }: VideoPlayerProps) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const internalPlayerRef = useRef<ReactPlayer>(null);
  const activePlayerRef = playerRef || internalPlayerRef;

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
        progressInterval={500}
        config={{
          file: {
            attributes: {
              controlsList: 'nodownload',
              crossOrigin: 'anonymous'
            }
          }
        }}
      />
    </div>
  );
}
