import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { publicVideoService } from '@/services/api.service';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, Loader2, ShieldX } from 'lucide-react';

export default function ShareVideoPlayer() {
  const { videoId } = useParams<{ videoId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || undefined;
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [qualities, setQualities] = useState<{ id: number; label: string }[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (videoId) loadVideo();
    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
    };
  }, [videoId]);

  const loadVideo = async () => {
    if (!token) {
      setError('Invalid share link. A valid share token is required to access this video.');
      setLoading(false);
      return;
    }
    try {
      const data = await publicVideoService.getVideoInfo(videoId!, token);
      setVideo(data);
      initPlayer(data);
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
      const hlsUrl = publicVideoService.getHLSUrl(videoData.id, token);
      const hls = new Hls({
        startLevel: -1,
        capLevelToPlayerSize: true,
        // Forward the share token to ALL HLS sub-requests (playlists & segments)
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
        const levels = data.levels.map((level, i) => ({
          id: i,
          label: `${level.height}p`,
        }));
        setQualities([{ id: -1, label: 'Auto' }, ...levels]);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentQuality(data.level);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
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

  const handleQualityChange = (levelId: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelId;
      setCurrentQuality(levelId);
    }
    setShowQualityMenu(false);
  };

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    setDuration(v.duration || 0);

    if (v.buffered.length > 0) {
      setBuffered(v.buffered.end(v.buffered.length - 1));
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    v.currentTime = percent * v.duration;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
          <p className="text-white/60 text-sm">Loading video...</p>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center animate-fade-in-up">
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

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Brand Header */}
      <div className="bg-gray-950 border-b border-gray-800 px-4 py-2.5 flex items-center justify-between animate-fade-in-down">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-sm tracking-tight">ReviewFlow</span>
          <span className="text-gray-600 text-xs">|</span>
          <span className="text-gray-400 text-xs truncate max-w-[200px] sm:max-w-none">{video.filename}</span>
        </div>
        {video.status && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 font-medium">
            {video.status}
          </span>
        )}
      </div>

      {/* Video Player Area */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-black flex items-center justify-center cursor-pointer"
        onClick={togglePlay}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { if (isPlaying) setShowControls(false); }}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          playsInline
        />

        {/* Center Play Button Overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 animate-fade-in">
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-all duration-300 hover:scale-110"
            >
              <Play className="h-8 w-8 sm:h-10 sm:w-10 text-white ml-1" />
            </button>
          </div>
        )}

        {/* Bottom Controls */}
        <div
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 sm:px-4 pb-3 sm:pb-4 pt-10 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress Bar */}
          <div
            className="w-full h-1.5 bg-white/20 rounded-full mb-3 cursor-pointer group relative"
            onClick={handleSeek}
          >
            {/* Buffered */}
            <div
              className="absolute h-full bg-white/30 rounded-full"
              style={{ width: duration ? `${(buffered / duration) * 100}%` : '0%' }}
            />
            {/* Played */}
            <div
              className="absolute h-full bg-white rounded-full transition-all"
              style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: duration ? `calc(${(currentTime / duration) * 100}% - 6px)` : '0' }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="text-white hover:text-white/80 transition-colors">
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="text-white hover:text-white/80 transition-colors">
                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <span className="text-white text-xs font-mono">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* Quality Selector - always visible */}
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowQualityMenu(!showQualityMenu); }}
                  className="text-white hover:text-white/80 transition-colors flex items-center gap-1.5 bg-white/10 hover:bg-white/20 rounded-lg px-2 py-1"
                >
                  <Settings className="h-4 w-4" />
                  <span className="text-[10px] font-medium">
                    {qualities.length === 0
                      ? 'Auto'
                      : currentQuality === -1
                        ? 'Auto'
                        : qualities.find(q => q.id === currentQuality)?.label || 'Auto'}
                  </span>
                </button>

                {showQualityMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setShowQualityMenu(false); }} />
                    <div className="absolute bottom-10 right-0 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl py-1.5 min-w-[140px] animate-scale-in z-50">
                      <div className="px-3 py-1 text-[9px] font-bold text-gray-500 uppercase tracking-wider">Quality</div>
                      {qualities.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-400">
                          Auto (detecting...)
                        </div>
                      ) : (
                        qualities.map((q) => (
                          <button
                            key={q.id}
                            onClick={(e) => { e.stopPropagation(); handleQualityChange(q.id); }}
                            className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                              (q.id === -1 ? currentQuality === -1 : currentQuality === q.id)
                                ? 'text-blue-400 bg-blue-500/10'
                                : 'text-gray-300 hover:bg-gray-800'
                            }`}
                          >
                            <span>{q.label}</span>
                            {(q.id === -1 ? currentQuality === -1 : currentQuality === q.id) && (
                              <span className="text-blue-400 text-[10px]">●</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className="text-white hover:text-white/80 transition-colors">
                <Maximize className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
