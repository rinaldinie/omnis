import React from "react";
import { Loader2 } from "lucide-react";
import { ActiveGameSession, GameDto, TranslateFn, formatImageUrl } from "../../types";

export interface FullscreenLaunchOverlayProps {
  activeGame?: ActiveGameSession | null;
  allGames?: GameDto[];
  filteredGames?: GameDto[];
  t: TranslateFn;
}

export const FullscreenLaunchOverlay: React.FC<FullscreenLaunchOverlayProps> = ({
  activeGame,
  allGames = [],
  filteredGames = [],
  t,
}) => {
  const [fadingOut, setFadingOut] = React.useState(false);
  const lastGameRef = React.useRef(activeGame);

  React.useEffect(() => {
    if (activeGame) {
      lastGameRef.current = activeGame;
    }
  }, [activeGame]);

  const prevActiveRef = React.useRef(activeGame);
  React.useEffect(() => {
    // When game session ends (activeGame was present, now null), trigger smooth fade-out into console view
    if (prevActiveRef.current && !activeGame) {
      setFadingOut(true);
      const timer = window.setTimeout(() => setFadingOut(false), 800);
      return () => window.clearTimeout(timer);
    }
    prevActiveRef.current = activeGame;
  }, [activeGame]);

  const isSessionActive = !!activeGame;
  const isVisible = isSessionActive || fadingOut;

  const currentOrLastGame = activeGame || (fadingOut ? lastGameRef.current : null);

  const game = React.useMemo(() => {
    const gameId = currentOrLastGame?.game_id;
    if (!gameId) return null;
    return (
      allGames.find((g) => g.id === gameId) ||
      filteredGames.find((g) => g.id === gameId) ||
      null
    );
  }, [currentOrLastGame, allGames, filteredGames]);

  if (!isVisible && !activeGame) {
    return null;
  }

  const title = game?.title || currentOrLastGame?.title || "";
  const bgSource = formatImageUrl(game?.background_image || game?.cover_image);
  const isUsingCoverFallback = !game?.background_image && !!game?.cover_image;

  const isRunning = currentOrLastGame?.state === "running";
  const isStopping = currentOrLastGame?.state === "stopping";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-[58] flex flex-col justify-end items-start overflow-hidden bg-black select-none transition-opacity duration-700 ease-out pointer-events-auto ${
        isSessionActive ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      style={{
        backgroundColor: "#05070c",
      }}
    >
      {/* 1. Immersive Fullscreen Background Artwork */}
      {bgSource ? (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img
            src={bgSource}
            alt=""
            className={`w-full h-full object-cover transition-transform duration-1000 ease-out omnis-ken-burns ${
              isUsingCoverFallback ? "blur-md scale-110 opacity-55" : "scale-100 opacity-85"
            }`}
          />
          {/* Subtle multi-layer cinematic vignette for high contrast and readability */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(5, 7, 12, 0.95) 0%, rgba(5, 7, 12, 0.6) 25%, rgba(5, 7, 12, 0.1) 60%, rgba(5, 7, 12, 0.35) 100%), radial-gradient(ellipse at center, transparent 45%, rgba(5, 7, 12, 0.55) 100%)",
            }}
          />
        </div>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at center, #111827 0%, #05070c 100%)",
          }}
        />
      )}

      {/* 2. Minimalist Cinematic HUD: Title and Status Only */}
      <div className="relative z-10 w-full max-w-6xl px-8 md:px-16 pb-10 md:pb-16 flex flex-col items-start gap-4 omnis-rise-in">
        {/* Title */}
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-tight line-clamp-2 drop-shadow-2xl">
          {title}
        </h1>

        {/* Status indicator pill */}
        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/15 shadow-xl">
          {isRunning ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-sm font-semibold tracking-wider text-emerald-300">
                {t("console_ui.running")}
              </span>
            </>
          ) : (
            <>
              <Loader2
                className={`w-4 h-4 animate-spin ${
                  isStopping ? "text-rose-400" : "text-sky-400"
                }`}
              />
              <span className="text-sm font-medium text-white/95">
                {isStopping
                  ? t("app_status.game_stopping")
                  : t("app_status.game_launching", { title })}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
