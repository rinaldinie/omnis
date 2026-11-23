import React from "react";
import { Gamepad2, Loader2 } from "lucide-react";
import { ActiveGameSession, GameDto, TranslateFn, formatImageUrl } from "../../types";
import { StoreIcon } from "../common/StoreBadge";

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
  const coverImage = formatImageUrl(game?.cover_image || game?.background_image);
  const isUsingCoverFallback = !game?.background_image && !!game?.cover_image;

  const isRunning = currentOrLastGame?.state === "running";
  const isStopping = currentOrLastGame?.state === "stopping";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-[58] flex flex-col justify-end items-center overflow-hidden bg-black select-none transition-opacity duration-700 ease-out pointer-events-auto ${
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
              isUsingCoverFallback ? "blur-md scale-110 opacity-55" : "scale-100 opacity-80"
            }`}
          />
          {/* Subtle multi-layer cinematic vignette for maximum readability without crushing the art */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(5, 7, 12, 0.98) 0%, rgba(5, 7, 12, 0.75) 28%, rgba(5, 7, 12, 0.2) 65%, rgba(5, 7, 12, 0.45) 100%), radial-gradient(ellipse at center, transparent 40%, rgba(5, 7, 12, 0.65) 100%)",
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

      {/* 2. Bottom-anchored Cinematic HUD (Console style) */}
      <div className="relative z-10 w-full max-w-7xl px-8 md:px-14 pb-10 md:pb-14 flex items-end justify-between gap-8 omnis-rise-in">
        {/* Left: Cover badge + Title + Metadata + Status */}
        <div className="flex items-end gap-6 max-w-3xl">
          {/* Sleek cover thumbnail */}
          <div
            className="relative w-24 h-36 md:w-28 md:h-40 rounded-xl overflow-hidden shrink-0 shadow-2xl bg-black/60 border border-white/20 transition-transform duration-500 ease-out"
            style={{
              boxShadow:
                "0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px color-mix(in srgb, var(--accent-primary) 35%, transparent)",
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
                <Gamepad2 className="w-10 h-10" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col gap-2 min-w-0">
            {/* Meta row: Store icon + library + genres */}
            {(game?.library || (game?.genres && game.genres.length > 0)) && (
              <div className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-wider text-white/70">
                {game?.library && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 backdrop-blur-md border border-white/10">
                    <StoreIcon library={game.library} className="w-3.5 h-3.5 text-white/90" />
                    <span className="capitalize">{game.library}</span>
                  </div>
                )}
                {game?.genres && game.genres.length > 0 && (
                  <span className="text-white/60 truncate">
                    {game.genres.slice(0, 3).join(" · ")}
                  </span>
                )}
                {game?.release_date && (
                  <span className="text-white/40">
                    · {game.release_date.match(/\d{4}/)?.[0] || game.release_date}
                  </span>
                )}
              </div>
            )}

            {/* Title */}
            <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight leading-tight line-clamp-2 drop-shadow-lg">
              {title}
            </h1>

            {/* Developers / Publishers */}
            {game?.developers && game.developers.length > 0 && (
              <p className="text-sm font-medium text-white/60 line-clamp-1">
                {game.developers.join(", ")}
              </p>
            )}

            {/* Status indicator pill & glow line */}
            <div className="mt-2 flex items-center gap-4">
              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/15 shadow-lg">
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
        </div>

        {/* Right side: Ambient decorative animated visualizer / pulse */}
        <div className="hidden lg:flex flex-col items-end gap-2 text-right text-white/40">
          <div className="flex items-center gap-1.5 h-6">
            <span
              className={`w-1 rounded-full animate-pulse h-4 ${
                isRunning ? "bg-emerald-400" : "bg-sky-400"
              }`}
            />
            <span
              className={`w-1 rounded-full animate-pulse delay-75 h-6 ${
                isRunning ? "bg-emerald-400" : "bg-sky-400"
              }`}
            />
            <span
              className={`w-1 rounded-full animate-pulse delay-150 h-3 ${
                isRunning ? "bg-emerald-400" : "bg-sky-400"
              }`}
            />
            <span
              className={`w-1 rounded-full animate-pulse delay-300 h-5 ${
                isRunning ? "bg-emerald-400" : "bg-sky-400"
              }`}
            />
          </div>
          <span className="text-[0.7rem] uppercase tracking-widest font-mono text-white/30">
            {isRunning ? "READY" : "INITIALIZING"}
          </span>
        </div>
      </div>
    </div>
  );
};
