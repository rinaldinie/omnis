import React from "react";
import { Gamepad2, Loader2 } from "lucide-react";
import { ActiveGameSession, GameDto, formatImageUrl } from "../../types";

export interface FullscreenLaunchOverlayProps {
  activeGame?: ActiveGameSession | null;
  allGames?: GameDto[];
  filteredGames?: GameDto[];
  t: (key: string, params?: Record<string, any>) => string;
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
  const bgImage = formatImageUrl(game?.background_image || game?.cover_image);
  const coverImage = formatImageUrl(game?.cover_image || game?.background_image);

  const isRunning = currentOrLastGame?.state === "running";
  const isStopping = currentOrLastGame?.state === "stopping";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-[58] flex flex-col items-center justify-center overflow-hidden bg-black select-none transition-opacity duration-700 ease-out pointer-events-auto ${
        isSessionActive ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      style={{
        backgroundColor: "#05070c",
      }}
    >
      {/* Ambient background artwork */}
      {bgImage && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img
            src={bgImage}
            alt=""
            className="w-full h-full object-cover blur-3xl scale-125 opacity-30 animate-pulse duration-1000"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(5, 7, 12, 0.45) 0%, rgba(5, 7, 12, 0.95) 85%)",
            }}
          />
        </div>
      )}

      {/* Main presentation card */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-xl px-8 omnis-rise-in">
        {/* Cover thumbnail */}
        <div
          className="relative w-44 h-60 rounded-xl overflow-hidden shadow-2xl flex items-center justify-center bg-black/60 border border-white/10"
          style={{
            boxShadow:
              "0 24px 60px rgba(0, 0, 0, 0.8), 0 0 40px color-mix(in srgb, var(--accent-primary) 30%, transparent)",
          }}
        >
          {coverImage ? (
            <img
              src={coverImage}
              alt={title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/30">
              <Gamepad2 className="w-16 h-16" />
            </div>
          )}
        </div>

        {/* Title */}
        <h1 className="mt-8 text-3xl font-extrabold text-white tracking-tight line-clamp-2 drop-shadow-md">
          {title}
        </h1>

        {/* Status text & indicator */}
        <div className="mt-5 flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
          {isRunning ? (
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-sm font-semibold tracking-wider text-emerald-300">
                {t("console_ui.running")}
              </span>
            </div>
          ) : (
            <>
              <Loader2 className={`w-5 h-5 animate-spin ${isStopping ? "text-rose-400" : "text-sky-400"}`} />
              <span className="text-sm font-medium text-white/90">
                {isStopping
                  ? t("app_status.game_stopping")
                  : t("app_status.game_launching", { title })}
              </span>
            </>
          )}
        </div>

        {/* Progress or active glow line */}
        <div className="mt-6 w-56 h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`w-full h-full rounded-full ${
              isRunning
                ? "bg-gradient-to-r from-emerald-400 to-teal-500 shadow-sm"
                : "bg-gradient-to-r from-sky-400 to-indigo-500 animate-pulse"
            }`}
          />
        </div>
      </div>
    </div>
  );
};
