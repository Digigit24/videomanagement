import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { publicVideoService } from '@/services/api.service';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import 'videojs-contrib-quality-levels';
import type Player from 'video.js/dist/types/player';
import { registerCustomComponents } from '@/components/videojs-custom-plugins';
import { Loader2, ShieldX, Play } from 'lucide-react';

registerCustomComponents();

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export default function ShareVideoPlayer() {
  const { videoId } = useParams<{ videoId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const autoFsDone = useRef(false);

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

  // Init player once video data is loaded and container is in DOM
  useEffect(() => {
    if (!video || !video.hls_ready || processing || playerRef.current || !containerRef.current) return;
    initPlayer(video);
  }, [video, processing]);

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
      }
    } catch {
      setError('This video is not available or the link has expired.');
    } finally {
      setLoading(false);
    }
  };

  const initPlayer = (videoData: any) => {
    if (!containerRef.current || playerRef.current) return;

    const hlsUrl = publicVideoService.getHLSUrl(videoData.id, token);

    // Dynamic element creation — avoids React/Video.js DOM conflicts
    const videoElement = document.createElement('video-js');
    videoElement.classList.add('vjs-big-play-centered');
    videoElement.style.cssText = 'width:100%!important;height:100%!important;position:absolute;top:0;left:0;';
    containerRef.current.appendChild(videoElement);

    const player = videojs(videoElement as any, {
      controls: true,
      autoplay: false,
      preload: 'auto',
      playsinline: true,
      html5: {
        vhs: {
          overrideNative: true,
          xhr: {
            beforeRequest: (options: Record<string, any>) => {
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

    // Force tech element to fill player
    const forceTechSize = () => {
      const techEl = player.tech({ IWillNotUseThisInPlugins: true })?.el() as HTMLVideoElement | undefined;
      if (techEl) {
        techEl.style.setProperty('width', '100%', 'important');
        techEl.style.setProperty('height', '100%', 'important');
        techEl.style.setProperty('max-width', 'none', 'important');
        techEl.style.setProperty('max-height', 'none', 'important');
        techEl.style.setProperty('object-fit', 'contain', 'important');
      }
    };
    player.ready(forceTechSize);

    // Detect portrait video and switch to cover
    const checkPortrait = () => {
      const techEl = player.tech({ IWillNotUseThisInPlugins: true })?.el() as HTMLVideoElement | undefined;
      if (techEl) {
        forceTechSize();
        if (techEl.videoWidth > 0 && techEl.videoHeight > techEl.videoWidth) {
          techEl.style.setProperty('object-fit', 'cover', 'important');
        }
      }
    };
    player.on('loadedmetadata', checkPortrait);
    player.on('loadeddata', checkPortrait);
    player.on('playing', checkPortrait);

    // Mobile: auto-fullscreen on first play + lock orientation
    if (isMobile) {
      player.on('play', () => {
        if (autoFsDone.current) return;
        autoFsDone.current = true;
        try { player.requestFullscreen(); } catch {}
        checkPortrait();
        const videoEl = player.tech({ IWillNotUseThisInPlugins: true })?.el() as HTMLVideoElement | undefined;
        if (videoEl && screen.orientation && 'lock' in screen.orientation) {
          const portrait = videoEl.videoHeight > videoEl.videoWidth;
          (screen.orientation as any).lock(portrait ? 'portrait' : 'landscape').catch(() => {});
        }
      });
    }
  };

  // --- Render states ---
  if (loading) {
    return (
      <div className="h-[100dvh] bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
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
          <h1 className="text-xl font-bold text-white mb-2">{!token ? 'Access Denied' : 'Video Unavailable'}</h1>
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
          <p className="text-gray-400 text-sm max-w-md">This video is still being processed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-black flex flex-col overflow-hidden">
      {/* Brand Header */}
      <div className="bg-gray-950 border-b border-gray-800 px-3 sm:px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white font-bold text-sm tracking-tight">ReviewFlow</span>
          <span className="text-gray-600 text-xs">|</span>
          <span className="text-gray-400 text-xs truncate max-w-[150px] sm:max-w-none">{video.filename}</span>
        </div>
      </div>

      {/* Video Player — dynamic video-js element created by initPlayer */}
      <div ref={containerRef} className="flex-1 bg-black relative min-h-0" />

    </div>
  );
}
