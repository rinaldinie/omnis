import React, { useState, useEffect, useRef } from "react";
import type Hls from "hls.js";
import { GameDto, ThemeConfig, formatImageUrl } from "../../types";
import { fetchGameTrailerUrl } from "../../utils/trailers";

interface VideoBackdropProps {
  game: GameDto | null | undefined;
  theme: ThemeConfig;
  className?: string;
  blurLevel?: "none" | "subtle" | "ambient";
  forceEnable?: boolean;
  isPaused?: boolean;
  videoOpacity?: number;
  objectPosition?: string;
  gradientOverlay?: "hero" | "ambient";
  imageFit?: "cover" | "contain";
}

export const VideoBackdrop: React.FC<VideoBackdropProps> = ({
  game,
  theme,
  className = "",
  blurLevel = "ambient",
  forceEnable = false,
  isPaused = false,
  videoOpacity,
  objectPosition = "center 20%",
  gradientOverlay = "ambient",
  imageFit = "cover",
}) => {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const prevGameIdRef = useRef<string | undefined>(game?.id);
  const gameRef = useRef(game);
  gameRef.current = game;
  const videoSrcRef = useRef(videoSrc);
  videoSrcRef.current = videoSrc;
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const isEnabled = forceEnable || !!theme.enable_video_backdrop;
  const effectiveVideoOpacity = videoOpacity ?? (theme.video_backdrop_opacity ?? 1.0);
  const delayMs = theme.video_delay_ms ?? 600;

  // 1. Resolve Game Trailer URL with Debounce
  useEffect(() => {
    const activeGameData = gameRef.current;
    const gameChanged = prevGameIdRef.current !== activeGameData?.id;
    prevGameIdRef.current = activeGameData?.id;

    if (gameChanged) {
      setIsVideoPlaying(false);
      setVideoSrc(null);

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    }

    if (!isEnabled || !activeGameData || isPaused) {
      return;
    }

    // If video is already loaded for this game, no need to re-fetch
    if (videoSrcRef.current && !gameChanged) {
      return;
    }

    let isMounted = true;

    // Debounce video start to avoid stutter during rapid navigation
    const timer = setTimeout(async () => {
      try {
        const trailerUrl = await fetchGameTrailerUrl(activeGameData);
        if (isMounted && trailerUrl && !isPausedRef.current) {
          setVideoSrc(trailerUrl);
        }
      } catch (err) {
        console.warn(`[VideoBackdrop] Error resolving trailer for '${activeGameData.title}':`, err);
      }
    }, delayMs);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [game?.id, game?.external_id, isEnabled, delayMs, isPaused]);

  // 2. Attach Video Source with 4-tier Cascade:
  // Tier 1: Native HLS (macOS / Safari / iOS WebKit)
  // Tier 2: Hls.js via Media Source Extensions (Windows WebView2 / Linux WebKitGTK / Blink)
  // Tier 3: Direct MP4/WebM progressive video stream fallback
  // Tier 4: Static poster background
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !videoSrc) {
      return;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHlsUrl = videoSrc.includes(".m3u8");
    const mp4FallbackUrl = isHlsUrl
      ? videoSrc.replace("movie.m3u8", "movie_max.mp4").replace(".m3u8", ".mp4")
      : null;

    // Helper to fall back to direct MP4
    const tryMp4Fallback = () => {
      if (mp4FallbackUrl && videoEl) {
        console.debug("[VideoBackdrop] Falling back to direct MP4 stream:", mp4FallbackUrl);
        videoEl.src = mp4FallbackUrl;
        if (!isPausedRef.current) {
          videoEl.play().catch(() => {
            setIsVideoPlaying(false);
          });
        }
      } else {
        setIsVideoPlaying(false);
        setVideoSrc(null);
      }
    };

    let cancelled = false;

    // Tier 1: Native HLS (Safari / macOS WebKit)
    if (isHlsUrl && videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      videoEl.src = videoSrc;
      if (!isPausedRef.current) {
        videoEl.play().catch((err) => {
          console.debug("[VideoBackdrop] Native HLS play error, attempting MP4 fallback:", err);
          tryMp4Fallback();
        });
      }
    }
    // Tier 2: Dynamically load Hls.js via Media Source Extensions (Windows WebView2, Linux WebKitGTK)
    else if (isHlsUrl) {
      void import("hls.js")
        .then(({ default: HlsClass }) => {
          if (cancelled) return;
          if (!HlsClass.isSupported()) {
            tryMp4Fallback();
            return;
          }

          const hls = new HlsClass({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 30,
          });

          hls.loadSource(videoSrc);
          hls.attachMedia(videoEl);

          hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
            if (!isPausedRef.current) {
              videoEl.play().catch((err) => {
                console.debug("[VideoBackdrop] Autoplay blocked:", err);
              });
            }
          });

          hls.on(HlsClass.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              console.warn("[VideoBackdrop] HLS fatal error, falling back to MP4:", data.type);
              hls.destroy();
              hlsRef.current = null;
              tryMp4Fallback();
            }
          });

          hlsRef.current = hls;
        })
        .catch(() => {
          if (!cancelled) {
            tryMp4Fallback();
          }
        });
    }
    // Tier 3: Direct video file (MP4 / WebM)
    else {
      videoEl.src = videoSrc;
      if (!isPausedRef.current) {
        videoEl.play().catch(() => {
          setIsVideoPlaying(false);
        });
      }
    }

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoSrc]);

  // 3. Pause / Resume orchestration when isPaused changes
  useEffect(() => {
    const videoEl = videoRef.current;
    if (isPaused) {
      if (videoEl && !videoEl.paused) {
        videoEl.pause();
      }
      setIsVideoPlaying(false);
      if (hlsRef.current) {
        hlsRef.current.stopLoad();
      }
    } else {
      if (videoEl && videoSrc && isEnabled) {
        if (hlsRef.current) {
          hlsRef.current.startLoad();
        }
        videoEl
          .play()
          .then(() => setIsVideoPlaying(true))
          .catch(() => {});
      }
    }
  }, [isPaused, videoSrc, isEnabled]);

  const blurClass =
    blurLevel === "none"
      ? ""
      : blurLevel === "subtle"
      ? "filter blur-[2px] scale-102"
      : "filter blur-sm scale-105";

  const backdropUrl =
    formatImageUrl(game?.background_image) ||
    game?.background_image ||
    formatImageUrl(game?.cover_image) ||
    game?.cover_image;

  // Without a real backdrop the cover is stretched across the whole hero: small or square
  // covers (e.g. 256px Switch icons) would look pixelated, so the fallback is always shown
  // as a soft ambient blur, like the theme-less hero does.
  const usingCoverFallback = !game?.background_image && !!game?.cover_image;
  const containMode = imageFit === "contain" && !usingCoverFallback;
  const containMaskStyle: React.CSSProperties | undefined = containMode
    ? {
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 12%, black 65%, transparent 100%)",
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 12%, black 65%, transparent 100%)",
      }
    : undefined;

  return (
    <div
      className={`absolute inset-0 z-0 overflow-hidden pointer-events-none select-none ${
        containMode ? "flex items-center justify-end" : ""
      } ${className}`}
    >
      {/* 1. Static Image Layer (renders immediately with high clarity and contrast) */}
      {backdropUrl ? (
        <img
          key={backdropUrl}
          src={backdropUrl}
          alt={game?.title || "Backdrop"}
          className={`${
            containMode ? "w-full h-auto max-h-full object-contain" : "w-full h-full object-cover"
          } transition-opacity duration-700 ${
            isVideoPlaying && !isPaused
              ? "opacity-0 pointer-events-none"
              : usingCoverFallback
              ? "opacity-50 filter blur-2xl scale-110"
              : blurLevel === "none"
              ? "opacity-95 filter-none scale-100"
              : blurLevel === "subtle"
              ? "opacity-85 filter blur-[2px] scale-102"
              : "opacity-75 filter blur-sm scale-105"
          }`}
          style={{ objectPosition, ...containMaskStyle }}
        />
      ) : (
        <div
          className="w-full h-full opacity-30"
          style={{
            background: `radial-gradient(circle at 50% 30%, var(--accent-glow) 0%, transparent 70%)`,
          }}
        />
      )}

      {/* 2. Dynamic Video Layer (crossfades in cleanly over the hidden poster) */}
      {videoSrc && (
        <video
          ref={videoRef}
          key={videoSrc}
          autoPlay={!isPaused}
          loop
          muted
          playsInline
          onPlaying={() => setIsVideoPlaying(true)}
          onCanPlay={() => setIsVideoPlaying(true)}
          onError={() => {
            setIsVideoPlaying(false);
            setVideoSrc(null);
          }}
          className={`video-backdrop absolute inset-0 w-full h-full ${
            containMode ? "object-contain" : "object-cover"
          } transition-opacity duration-700 ${
            blurLevel === "none" ? "filter-none" : blurClass
          }`}
          style={{
            objectPosition,
            opacity: !isPaused && isVideoPlaying ? effectiveVideoOpacity : 0,
            ...containMaskStyle,
          }}
        />
      )}

      {/* 3. Directional Vignette & Gradient Overlays (preserves bottom/left readability while keeping hero art vivid) */}
      <div
        className="absolute inset-0 transition-colors duration-500"
        style={{
          background:
            gradientOverlay === "hero"
              ? `
                linear-gradient(to top, var(--bg-base) 0%, rgba(11, 14, 20, 0.9) 14%, rgba(11, 14, 20, 0.25) 36%, transparent 60%),
                linear-gradient(to right, rgba(11, 14, 20, 0.75) 0%, rgba(11, 14, 20, 0.2) 28%, transparent 50%)
              `
              : `
                linear-gradient(to top, var(--bg-base) 0%, var(--bg-base) 18%, rgba(11, 14, 20, 0.65) 45%, rgba(11, 14, 20, 0.15) 75%, transparent 100%),
                linear-gradient(to right, rgba(11, 14, 20, 0.85) 0%, rgba(11, 14, 20, 0.45) 40%, transparent 75%)
              `,
        }}
      />
    </div>
  );
};

export default VideoBackdrop;
