import { useState, useRef, useEffect } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import type Player from 'video.js/dist/types/player';
import { registerCustomComponents } from './videojs-custom-plugins';

registerCustomComponents();

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

interface HLSPlayerProps {
  hlsUrl: string;
  fallbackUrl: string;
  downloadUrl?: string;
  onProgress?: (state: { played: number; playedSeconds: number }) => void;
  onPlayerRef?: (ref: { seekTo: (time: number) => void; pause: () => void }) => void;
  onPlayingChange?: (playing: boolean) => void;
  onPlayerError?: () => void;
}

export default function HLSPlayer({
  hlsUrl,
  fallbackUrl,
  downloadUrl,
  onProgress,
  onPlayerRef,
  onPlayingChange,
  onPlayerError,
}: HLSPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const autoFsDone = useRef(false);

  const [showIntro, setShowIntro] = useState(false);
  const [introShown, setIntroShown] = useState(false);
  const [error, setError] = useState(false);

  const onProgressRef = useRef(onProgress);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const onPlayerErrorRef = useRef(onPlayerError);
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => { onPlayingChangeRef.current = onPlayingChange; }, [onPlayingChange]);
  useEffect(() => { onPlayerErrorRef.current = onPlayerError; }, [onPlayerError]);

  useEffect(() => {
    if (onPlayerRef && playerRef.current) {
      onPlayerRef({
        seekTo: (time: number) => { playerRef.current?.currentTime(time); },
        pause: () => { playerRef.current?.pause(); },
      });
    }
  }, [onPlayerRef]);

  useEffect(() => {
    if (!containerRef.current) return;

    const token = localStorage.getItem('token');

    // Pull the auth params from the initial hlsUrl so VHS sub-requests
    // (variant playlists, segments) can carry them even if the server-side
    // playlist rewrite fails or is bypassed by a CDN/proxy.
    let inheritedBucket = '';
    let inheritedToken = '';
    try {
      const u = new URL(hlsUrl, window.location.origin);
      inheritedBucket = u.searchParams.get('bucket') || '';
      inheritedToken = u.searchParams.get('token') || '';
    } catch { /* ignore parse failures */ }

    // Use <video-js> custom element — Video.js handles it natively
    const videoElement = document.createElement('video-js');
    videoElement.classList.add('vjs-big-play-centered');
    containerRef.current.appendChild(videoElement);

    const player = videojs(videoElement as any, {
      controls: true,
      autoplay: false,
      preload: 'auto',
      playsinline: true,
      fill: true,
      html5: {
        vhs: {
          overrideNative: true,
          xhr: {
            beforeRequest: (options: Record<string, any>) => {
              if (token) {
                if (!options.headers) options.headers = {};
                options.headers.Authorization = `Bearer ${token}`;
              }
              // Defense-in-depth: ensure bucket+token are present on every
              // sub-request URL. validateBucket middleware requires bucket as
              // a query param, and a CDN/proxy that strips them would cause
              // a 400 → MEDIA_ERR_SRC_NOT_SUPPORTED in the player.
              if (typeof options.uri === 'string' && (inheritedBucket || inheritedToken)) {
                try {
                  const u = new URL(options.uri, window.location.origin);
                  if (inheritedBucket && !u.searchParams.has('bucket')) {
                    u.searchParams.set('bucket', inheritedBucket);
                  }
                  if (inheritedToken && !u.searchParams.has('token')) {
                    u.searchParams.set('token', inheritedToken);
                  }
                  options.uri = u.toString();
                } catch { /* leave uri as-is on parse failure */ }
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

    // Mobile: auto-fullscreen on first play + force portrait for vertical videos
    if (isMobile) {
      const getVideoEl = () => player.el().querySelector('video') as HTMLVideoElement | null;
      const isPortraitVideo = (): boolean | null => {
        const vid = getVideoEl();
        if (!vid || !vid.videoWidth || !vid.videoHeight) return null;
        return vid.videoHeight > vid.videoWidth;
      };

      const applyRotationFallback = () => {
        const portrait = isPortraitVideo();
        const playerEl = player.el() as HTMLElement;
        const vid = getVideoEl();
        if (!vid) return;
        // Clear previous transform
        vid.style.transform = '';
        vid.style.width = '';
        vid.style.height = '';
        vid.style.position = '';
        vid.style.top = '';
        vid.style.left = '';
        if (!player.isFullscreen() || portrait === null) return;
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const screenLandscape = screenW > screenH;
        // Vertical video on landscape phone → rotate 90deg
        if (portrait && screenLandscape) {
          playerEl.style.background = '#000';
          vid.style.position = 'absolute';
          vid.style.top = '50%';
          vid.style.left = '50%';
          vid.style.width = `${screenH}px`;
          vid.style.height = `${screenW}px`;
          vid.style.transform = 'translate(-50%, -50%) rotate(90deg)';
          vid.style.objectFit = 'contain';
        }
      };

      const tryLockOrientation = () => {
        const portrait = isPortraitVideo();
        if (portrait === null) return;
        if (screen.orientation && 'lock' in screen.orientation) {
          (screen.orientation as any)
            .lock(portrait ? 'portrait' : 'landscape')
            .then(() => {
              // Lock worked — clear any rotation fallback
              setTimeout(applyRotationFallback, 100);
            })
            .catch(() => {
              // Lock failed — use CSS rotation fallback instead
              applyRotationFallback();
            });
        } else {
          applyRotationFallback();
        }
      };

      const enterFullscreenAndOrient = async () => {
        try {
          const fs = player.requestFullscreen();
          if (fs && typeof (fs as any).then === 'function') await fs;
        } catch {}
        if (isPortraitVideo() === null) {
          player.one('loadedmetadata', () => {
            tryLockOrientation();
            setTimeout(tryLockOrientation, 200);
          });
        } else {
          tryLockOrientation();
        }
        setTimeout(tryLockOrientation, 500);
      };

      player.on('play', () => {
        if (autoFsDone.current) return;
        autoFsDone.current = true;
        enterFullscreenAndOrient();
      });

      // Re-apply rotation on resize (e.g. when device rotates)
      window.addEventListener('resize', applyRotationFallback);

      // Release lock + clear rotation when leaving fullscreen
      player.on('fullscreenchange', () => {
        if (player.isFullscreen()) {
          setTimeout(tryLockOrientation, 100);
        } else {
          if (screen.orientation && 'unlock' in screen.orientation) {
            try { (screen.orientation as any).unlock(); } catch {}
          }
          const vid = getVideoEl();
          if (vid) {
            vid.style.transform = '';
            vid.style.width = '';
            vid.style.height = '';
            vid.style.position = '';
            vid.style.top = '';
            vid.style.left = '';
          }
        }
      });
    }

    player.ready(() => {
      if (downloadUrl) {
        const Button = videojs.getComponent('Button') as any;
        class DownloadButton extends Button {
          constructor(p: any, options: any) {
            super(p, options);
            this.controlText('Download');
            this.addClass('vjs-download-button');
          }
          handleClick() { window.open(downloadUrl, '_blank'); }
          buildCSSClass() { return `vjs-download-button vjs-control vjs-button ${super.buildCSSClass()}`; }
        }
        videojs.registerComponent('DownloadButton', DownloadButton as any);
        player.getChild('controlBar')?.addChild('DownloadButton', {});
      }
      if (onPlayerRef) {
        onPlayerRef({
          seekTo: (time: number) => player.currentTime(time),
          pause: () => player.pause(),
        });
      }
    });

    player.on('timeupdate', () => {
      const ct = player.currentTime() || 0;
      const dur = player.duration() || 0;
      if (dur > 0 && onProgressRef.current) {
        onProgressRef.current({ played: ct / dur, playedSeconds: ct });
      }
    });

    player.on('play', () => onPlayingChangeRef.current?.(true));
    player.on('pause', () => onPlayingChangeRef.current?.(false));
    player.on('ended', () => onPlayingChangeRef.current?.(false));

    let errorCount = 0;
    player.on('error', () => {
      console.error('Video.js error:', player.error());
      errorCount++;
      if (errorCount === 1 && fallbackUrl) {
        // First error: try direct stream as fallback
        player.src({ src: fallbackUrl, type: 'video/mp4' });
      } else {
        setError(true);
        onPlayerErrorRef.current?.();
      }
    });

    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [hlsUrl, fallbackUrl, downloadUrl]);

  // Intro overlay on first play
  useEffect(() => {
    const player = playerRef.current;
    if (!player || introShown) return;
    const handleFirstPlay = () => {
      if (!introShown) {
        player.pause();
        setShowIntro(true);
        setIntroShown(true);
        setTimeout(() => {
          setShowIntro(false);
          if (playerRef.current && !playerRef.current.isDisposed()) {
            playerRef.current.play();
          }
        }, 3000);
      }
    };
    player.on('play', handleFirstPlay);
    return () => { player.off('play', handleFirstPlay); };
  }, [introShown]);

  return (
    <div className="w-full relative bg-black" style={{ aspectRatio: '16/9' }}>
      {/* Video.js creates its wrapper div here */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Intro Overlay */}
      {showIntro && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-30 overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-1/4 left-1/6 w-48 h-48 bg-blue-600/15 rounded-full blur-[80px] animate-intro-particles" />
            <div className="absolute bottom-1/4 right-1/6 w-56 h-56 bg-emerald-500/12 rounded-full blur-[80px] animate-intro-particles" style={{ animationDelay: '0.2s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-amber-500/8 rounded-full blur-[100px] animate-intro-particles" style={{ animationDelay: '0.4s' }} />
          </div>
          <div className="flex flex-col items-center relative z-10">
            <div className="animate-intro-logo">
              <img src="/digitech-logo.svg" alt="Digitech Solutions" className="h-16 sm:h-20 md:h-24 w-auto drop-shadow-2xl" style={{ filter: 'brightness(0) invert(1) drop-shadow(0 0 30px rgba(59,130,246,0.3))' }} />
            </div>
            <div className="mt-5 h-[1px] bg-gradient-to-r from-transparent via-blue-400/50 to-transparent rounded-full animate-intro-line" />
            <p className="mt-3 text-[10px] sm:text-xs text-white/30 tracking-[0.4em] uppercase font-light animate-intro-subtitle">Premium Video Experience</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 z-10">
          <div className="text-center">
            <p className="text-red-400 text-sm mb-3">Failed to load video</p>
            <button onClick={() => { setError(false); playerRef.current?.src({ src: fallbackUrl, type: 'video/mp4' }); }} className="text-sm text-gray-300 hover:text-white px-4 py-1.5 border border-gray-600 rounded-md transition-colors">Try Again</button>
          </div>
        </div>
      )}
    </div>
  );
}
