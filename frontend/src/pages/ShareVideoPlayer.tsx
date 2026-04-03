import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { publicVideoService } from '@/services/api.service';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import 'videojs-landscape-fullscreen';
import 'videojs-contrib-quality-levels';
import type Player from 'video.js/dist/types/player';
import { registerCustomComponents } from '@/components/videojs-custom-plugins';

registerCustomComponents();
import { Loader2, ShieldX, Play } from 'lucide-react';

export default function ShareVideoPlayer() {
  const { videoId } = useParams<{ videoId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || undefined;
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);

  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (videoId) loadVideo();
    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [videoId]);

  // Poll for processing status
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
          setTimeout(() => initPlayer(data), 100);
          return;
        }
      } catch {}
      delay = Math.min(delay * 1.5, 30000);
      timer = setTimeout(poll, delay);
    };
    timer = setTimeout(poll, delay);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [videoId, processing, token]);

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
        setTimeout(() => initPlayer(data), 100);
      }
    } catch (err: unknown) {
      setError('This video is not available or the link has expired.');
    } finally {
      setLoading(false);
    }
  };

  const initPlayer = (videoData: any) => {
    if (!videoContainerRef.current || playerRef.current) return;
    if (!videoData.hls_ready) { setProcessing(true); return; }

    const videoElement = document.createElement('video-js');
    videoElement.classList.add('vjs-big-play-centered', 'vjs-fill');
    videoElement.style.cssText = 'width:100%;height:100%;position:absolute;top:0;left:0;';
    videoContainerRef.current.appendChild(videoElement);

    const hlsUrl = publicVideoService.getHLSUrl(videoData.id, token);

    const player = videojs(videoElement, {
      controls: true,
      autoplay: false,
      preload: 'auto',
      fluid: false,
      fill: true,
      responsive: true,
      playsinline: true,
      html5: {
        vhs: {
          overrideNative: true,
          xhr: {
            beforeRequest: (options: Record<string, any>) => {
              // Append token to sub-requests (segments, playlists)
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

    // Landscape fullscreen plugin
    (player as any).landscapeFullscreen({
      fullscreen: {
        enterOnRotate: true,
        exitOnRotate: true,
        alwaysInLandscapeMode: false,
        iOS: true,
      },
    });

    // Force video element to fill player (bypass CSS specificity issues)
    player.ready(() => {
      const tech = player.el()?.querySelector('video');
      if (tech) {
        (tech as HTMLElement).style.cssText += 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;';
      }
    });
  };

  // --- Render states ---
  if (loading) {
    return (
      <div className="h-[100dvh] bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
          <p className="text-white/60 text-sm">Loading video...</p>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="h-[100dvh] bg-gray-950 flex items-center justify-center p-4">
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
      <div className="h-[100dvh] bg-gray-950 flex items-center justify-center p-4">
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
    <div className="h-[100dvh] bg-black flex flex-col overflow-hidden">
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

      {/* Video.js Player */}
      <div ref={videoContainerRef} className="flex-1 bg-black relative min-h-0" />
    </div>
  );
}
