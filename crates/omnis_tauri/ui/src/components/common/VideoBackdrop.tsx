import React, { useState, useEffect, useRef } from "react";
import { GameDto, ThemeConfig } from "../../types";
import { resolveGameTrailerUrl } from "../../utils/trailers";

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

  const isEnabled = forceEnable || !!theme.enable_video_backdrop;
  const targetOpacity = theme.video_backdrop_opacity ?? 0.55;
  const delayMs = theme.video_delay_ms ?? 1000;

  useEffect(() => {
    // Reset video state on game change
    setIsVideoPlaying(false);
    setVideoSrc(null);

    if (!isEnabled || !game) {
      return;
    }

    const trailerUrl = resolveGameTrailerUrl(game);
    if (!trailerUrl) {
      return;
    }

    // Debounce video start to avoid stutter during rapid library browsing
    const timer = setTimeout(() => {
      setVideoSrc(trailerUrl);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [game?.id, isEnabled, delayMs]);

  const blurClass =
    blurLevel === "none"
      ? ""
      : blurLevel === "subtle"
      ? "filter blur-sm scale-105"
      : "filter blur-xl scale-110";

  return (
    <div className={`absolute inset-0 z-0 overflow-hidden pointer-events-none select-none ${className}`}>
      {/* 1. Static Image Layer (always rendered immediately as baseline) */}
      {game?.background_image ? (
        <img
          src={game.background_image}
          alt={game.title || "Backdrop"}
          className={`w-full h-full object-cover transition-all duration-700 ${
            blurLevel === "ambient" ? "opacity-25 filter blur-2xl scale-110" : "opacity-40 object-cover"
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
          src={videoSrc}
          autoPlay
          loop
          muted
          playsInline
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
