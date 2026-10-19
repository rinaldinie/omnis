import React, { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import { GameDto, ThemeConfig } from "../../types";
import { fetchGameTrailerUrl } from "../../utils/trailers";

interface VideoBackdropProps {
  game: GameDto | null | undefined;
  theme: ThemeConfig;
  className?: string;
  blurLevel?: "none" | "subtle" | "ambient";
  forceEnable?: boolean;
}

export const VideoBackdrop: React.FC<VideoBackdropProps> = ({
  game,
  theme,
  className = "",
  blurLevel = "ambient",
  forceEnable = false,
}) => {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const isEnabled = forceEnable || !!theme.enable_video_backdrop;
  const targetOpacity = theme.video_backdrop_opacity ?? 0.55;
  const delayMs = theme.video_delay_ms ?? 800;

  // 1. Resolve Game Trailer URL with Debounce
  useEffect(() => {
    setIsVideoPlaying(false);
    setVideoSrc(null);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (!isEnabled || !game) {
      return;
    }

    let isMounted = true;

    // Debounce video start to avoid stutter during rapid navigation
    const timer = setTimeout(async () => {
      try {
        const trailerUrl = await fetchGameTrailerUrl(game);
        if (isMounted && trailerUrl) {
          setVideoSrc(trailerUrl);
        }
      } catch (err) {
        console.warn(`[VideoBackdrop] Error resolving trailer for '${game.title}':`, err);
      }
    }, delayMs);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [game?.id, game?.external_id, isEnabled, delayMs]);

  // 2. Attach Video Source (HLS Stream or MP4/WebM)
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

    if (isHlsUrl && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
      });

      hls.loadSource(videoSrc);
      hls.attachMedia(videoEl);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoEl.play().catch((err) => {
          // Autoplay was blocked or aborted, wait for interaction
          console.debug("[VideoBackdrop] Autoplay blocked:", err);
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.warn("[VideoBackdrop] HLS fatal error:", data.type);
          hls.destroy();
          hlsRef.current = null;
          setIsVideoPlaying(false);
          setVideoSrc(null);
        }
      });

      hlsRef.current = hls;
    } else if (isHlsUrl && videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      videoEl.src = videoSrc;
      videoEl.play().catch(() => {});
    } else {
      videoEl.src = videoSrc;
      videoEl.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoSrc]);

  const blurClass =
    blurLevel === "none"
      ? ""
      : blurLevel === "subtle"
      ? "filter blur-sm scale-105"
      : "filter blur-xl scale-110";

  return (
    <div
      className={`absolute inset-0 z-0 overflow-hidden pointer-events-none select-none ${className}`}
    >
      {/* 1. Static Image Layer (always rendered immediately as baseline) */}
      {game?.background_image ? (
        <img
          src={game.background_image}
          alt={game.title || "Backdrop"}
          className={`w-full h-full object-cover transition-all duration-700 ${
            blurLevel === "ambient"
              ? "opacity-25 filter blur-2xl scale-110"
              : "opacity-40 object-cover"
          }`}
        />
      ) : (
        <div
          className="w-full h-full opacity-30"
          style={{
            background: `radial-gradient(circle at 50% 30%, var(--accent-glow) 0%, transparent 70%)`,
          }}
        />
      )}

      {/* 2. Dynamic Video Layer (crossfades in when trailer is playing) */}
      {videoSrc && (
        <video
          ref={videoRef}
          key={videoSrc}
          autoPlay
          loop
          muted
          playsInline
          onPlaying={() => setIsVideoPlaying(true)}
          onCanPlay={() => setIsVideoPlaying(true)}
          onError={() => {
            setIsVideoPlaying(false);
            setVideoSrc(null);
          }}
          className={`video-backdrop absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${blurClass}`}
          style={{
            opacity: isVideoPlaying ? targetOpacity : 0,
          }}
        />
      )}

      {/* 3. Cinema Dark Gradient Overlay (guarantees text & UI readability) */}
      <div
        className="absolute inset-0 transition-colors duration-500"
        style={{
          background: `linear-gradient(to top, var(--bg-base) 10%, rgba(11, 14, 20, 0.65) 50%, rgba(11, 14, 20, 0.85) 100%)`,
        }}
      />
    </div>
  );
};

export default VideoBackdrop;
