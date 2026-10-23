import React, { useEffect } from "react";
import {
  Gamepad2,
  Search,
  Volume2,
  VolumeX,
  Palette,
  Puzzle,
  Minimize2,
  Minus,
  X,
  Play,
  Download,
  Info,
  RefreshCw,
  CheckCircle2,
  Tv,
  Square,
  ArrowLeft,
} from "lucide-react";
import { ActiveGameSession, GameDto, LibraryCounts, ThemeConfig, formatImageUrl } from "../../types";
import { StoreBadge, StoreIcon } from "../StoreBadge";
import soundEffects from "../../utils/soundEffects";
import { VideoBackdrop } from "../common/VideoBackdrop";
import { GameCardCover } from "../common/GameCardCover";
import { Slot } from "../common/Slot";
import { GameAchievementsGallery } from "../achievements";
import { useTranslation } from "../../i18n/i18nContext";

interface BigPictureViewProps {
  focusedGame: GameDto | null;
  filteredGames: GameDto[];
  focusedIndex: number;
  setFocusedIndex: (idx: number) => void;
  setSelectedGame: (game: GameDto) => void;
  counts: LibraryCounts;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  gamepadConnected: boolean;
  gamepadName: string;
  searchQuery: string;
  setShowVirtualKeyboard: (show: boolean) => void;
  soundEnabled: boolean;
  handleToggleSound: () => void;
  currentTheme: ThemeConfig;
  setShowThemeModal: (show: boolean) => void;
  loadProvidersAndConfig: () => void;
  setShowPluginModal: (show: boolean) => void;
  toggleBigPicture: () => void;
  handleMinimize: () => void;
  handleClose: () => void;
  handleToggleMaximize: () => void;
  handleStartDragging: (e: React.MouseEvent) => void;
  handleLaunch: (gameId: string) => void;
  handleSync: () => void;
  isSyncing: boolean;
  showFullscreenDetails: boolean;
  setShowFullscreenDetails: React.Dispatch<React.SetStateAction<boolean>>;
  carouselRef: React.RefObject<HTMLDivElement>;
  t: (key: string, params?: Record<string, any>) => string;
  isGameRunning?: boolean;
  activeGame?: ActiveGameSession | null;
  elapsedSeconds?: number;
  formatDuration?: (seconds: number) => string;
  handleKillRunningGame?: () => void;
  sessionToast?: {
    title: string;
    durationSeconds: number;
    gameId: string;
  } | null;
  onDismissToast?: () => void;
}

function BigPictureCardCover({ game }: { game: GameDto }) {
  const [imgSrc, setImgSrc] = React.useState<string | null>(game.cover_image || null);
  const [isFallback, setIsFallback] = React.useState(false);
  const [hasError, setHasError] = React.useState(!game.cover_image);

  React.useEffect(() => {
    setImgSrc(game.cover_image || null);
    setIsFallback(false);
    setHasError(!game.cover_image);
  }, [game.cover_image]);

  const handleError = () => {
    if (imgSrc && imgSrc.includes("library_600x900_2x.jpg") && !isFallback) {
      setIsFallback(true);
      setImgSrc(imgSrc.replace("library_600x900_2x.jpg", "header.jpg"));
    } else if (game.background_image && imgSrc !== game.background_image && !isFallback) {
      setIsFallback(true);
      setImgSrc(game.background_image);
    } else {
      setHasError(true);
    }
  };

  if (hasError || !imgSrc) {
    return (
      <div
        className="w-full h-full flex flex-col justify-between p-4 select-none [transform:translateZ(0)] [backface-visibility:hidden]"
        style={{ backgroundColor: "var(--bg-card)" }}
      >
        <StoreBadge library={game.library} showName={true} />
        <span className="font-black text-sm text-white line-clamp-3 leading-snug break-words select-none [transform:translateZ(0)]">
          {game.title}
        </span>
        <span className="text-[10px] font-semibold select-none" style={{ color: "var(--text-muted)" }}>
          {game.playtime_formatted}
        </span>
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={game.title}
      className="w-full h-full object-cover [transform:translateZ(0)] [backface-visibility:hidden]"
      loading="lazy"
      onError={handleError}
    />
  );
}

export default function BigPictureView({
  focusedGame,
  filteredGames,
  focusedIndex,
  setFocusedIndex,
  setSelectedGame,
  counts,
  activeFilter,
  setActiveFilter,
  gamepadConnected,
  gamepadName,
  searchQuery,
  setShowVirtualKeyboard,
  soundEnabled,
  handleToggleSound,
  currentTheme,
  setShowThemeModal,
  loadProvidersAndConfig,
  setShowPluginModal,
  toggleBigPicture,
  handleMinimize,
  handleClose,
  handleToggleMaximize,
  handleStartDragging,
  handleLaunch,
  handleSync,
  isSyncing,
  showFullscreenDetails,
  setShowFullscreenDetails,
  carouselRef,
  t,
  isGameRunning = false,
  activeGame,
  elapsedSeconds,
  formatDuration,
  handleKillRunningGame,
  sessionToast,
  onDismissToast,
}: BigPictureViewProps) {
  const { locale } = useTranslation();
  const isFocusedGameRunning = activeGame?.game_id === focusedGame?.id;

  // Lock game for details view so navigation inside details never switches games underneath
  const [detailGame, setDetailGame] = React.useState<GameDto | null>(null);

  React.useEffect(() => {
    if (showFullscreenDetails && focusedGame) {
      setDetailGame(focusedGame);
    } else if (!showFullscreenDetails) {
      setDetailGame(null);
    }
  }, [showFullscreenDetails, focusedGame]);

  const activeDetailGame = detailGame || focusedGame;

  // Navigation state inside Game Details page
  const [detailsFocusedSection, setDetailsFocusedSection] = React.useState<"hero" | "achievements">("hero");
  const [heroFocusedButton, setHeroFocusedButton] = React.useState<"launch" | "back">("launch");
  const [achievementsFocusedIndex, setAchievementsFocusedIndex] = React.useState<number>(-1);
  const [totalAchievements, setTotalAchievements] = React.useState<number>(0);
  const detailsScrollRef = React.useRef<HTMLDivElement>(null);

  // Reset focus when details page opens
  React.useEffect(() => {
    if (showFullscreenDetails) {
      setDetailsFocusedSection("hero");
      setHeroFocusedButton("launch");
      setAchievementsFocusedIndex(-1);
      detailsScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [showFullscreenDetails]);

  // Handle D-pad / stick / arrow navigation inside Details page
  React.useEffect(() => {
    if (!showFullscreenDetails) return;

    const handleDetailsNav = (e: Event) => {
      const customEvent = e as CustomEvent<{ direction: "up" | "down" | "left" | "right" }>;
      const dir = customEvent.detail?.direction;
      if (!dir) return;

      if (dir === "down") {
        if (detailsFocusedSection === "hero") {
          setDetailsFocusedSection("achievements");
          setAchievementsFocusedIndex(0);
          soundEffects.playNav();
          detailsScrollRef.current?.scrollBy({ top: 380, behavior: "smooth" });
        } else {
          detailsScrollRef.current?.scrollBy({ top: 220, behavior: "smooth" });
        }
      } else if (dir === "up") {
        if (detailsFocusedSection === "achievements") {
          setDetailsFocusedSection("hero");
          setAchievementsFocusedIndex(-1);
          soundEffects.playNav();
          detailsScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          detailsScrollRef.current?.scrollBy({ top: -220, behavior: "smooth" });
        }
      } else if (dir === "left") {
        if (detailsFocusedSection === "hero") {
          setHeroFocusedButton((prev) => {
            if (prev !== "launch") soundEffects.playNav();
            return "launch";
          });
        } else if (detailsFocusedSection === "achievements") {
          if (totalAchievements > 0) {
            setAchievementsFocusedIndex((prev) => {
              const next = prev <= 0 ? totalAchievements - 1 : prev - 1;
              soundEffects.playNav();
              return next;
            });
          }
        }
      } else if (dir === "right") {
        if (detailsFocusedSection === "hero") {
          setHeroFocusedButton((prev) => {
            if (prev !== "back") soundEffects.playNav();
            return "back";
          });
        } else if (detailsFocusedSection === "achievements") {
          if (totalAchievements > 0) {
            setAchievementsFocusedIndex((prev) => {
              const next = prev < 0 ? 0 : (prev + 1) % totalAchievements;
              soundEffects.playNav();
              return next;
            });
          }
        }
      }
    };

    window.addEventListener("omnis:details-nav", handleDetailsNav);
    return () => window.removeEventListener("omnis:details-nav", handleDetailsNav);
  }, [showFullscreenDetails, detailsFocusedSection, totalAchievements]);

  // Handle Button A / Enter inside Details page
  React.useEffect(() => {
    if (!showFullscreenDetails) return;

    const handleActionA = () => {
      soundEffects.playSelect();
      if (detailsFocusedSection === "hero") {
        if (heroFocusedButton === "back") {
          setShowFullscreenDetails(false);
        } else {
          if (isFocusedGameRunning && handleKillRunningGame) {
            handleKillRunningGame();
            setShowFullscreenDetails(false);
          } else if (activeDetailGame) {
            handleLaunch(activeDetailGame.id);
            setShowFullscreenDetails(false);
          }
        }
      }
    };

    window.addEventListener("omnis:details-action-a", handleActionA);
    return () => window.removeEventListener("omnis:details-action-a", handleActionA);
  }, [
    showFullscreenDetails,
    detailsFocusedSection,
    heroFocusedButton,
    isFocusedGameRunning,
    activeDetailGame,
    handleKillRunningGame,
    handleLaunch,
    setShowFullscreenDetails,
  ]);

  // Shortcut key listener: "k" or "Delete" terminates running focused game
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key.toLowerCase() === "k" || e.key === "Delete") &&
        activeGame?.game_id === focusedGame?.id &&
        handleKillRunningGame
      ) {
        e.preventDefault();
        handleKillRunningGame();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeGame, focusedGame, handleKillRunningGame]);
  return (
    <main
      data-omnis="bigpicture"
      className="relative flex flex-col h-screen w-screen overflow-hidden transition-colors duration-500"
      style={{ backgroundColor: "var(--bg-base)" }}
    >
      {/* Ambient Cinema Backdrop / Dynamic Video Trailer */}
      <VideoBackdrop
        game={focusedGame}
        theme={currentTheme}
        blurLevel={currentTheme.enable_video_backdrop ? "subtle" : "ambient"}
        isPaused={isGameRunning}
      />

      {/* 10-FOOT TOP BAR */}
      <header
        onMouseDown={handleStartDragging}
        onDoubleClick={handleToggleMaximize}
        data-tauri-drag-region
        className="relative z-20 flex items-center justify-between px-10 py-5 border-b cursor-default select-none"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
            style={{
              backgroundColor: "var(--accent-primary)",
              boxShadow: `0 0 20px var(--accent-glow)`,
            }}
          >
            <Tv className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-lg tracking-wider text-white">OMNIS BIG PICTURE</span>
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              Modalità Fullscreen & Controller TV
            </span>
          </div>
        </div>

        {/* Live Running Game Indicator in 10-Foot Top Bar */}
        {activeGame && (
          <div className={`flex items-center gap-3 px-5 py-2.5 rounded-full border-2 text-sm font-extrabold shadow-xl backdrop-blur-md ${
            activeGame.state === "launching"
              ? "bg-amber-500/20 border-amber-500/60 text-amber-300 animate-pulse shadow-amber-950/60"
              : activeGame.state === "stopping"
              ? "bg-rose-500/20 border-rose-500/60 text-rose-300 shadow-rose-950/60"
              : "bg-emerald-500/20 border-emerald-500/60 text-emerald-300 animate-pulse shadow-emerald-950/60"
          }`}>
            <span className={`w-2.5 h-2.5 rounded-full ${
              activeGame.state === "launching" ? "bg-amber-400" : activeGame.state === "stopping" ? "bg-rose-400" : "bg-emerald-400 animate-ping"
            }`} />
            <span>
              {activeGame.state === "launching" ? (
                <>⏳ {t("status.launching")} <strong className="text-white">{activeGame.title}</strong>...</>
              ) : activeGame.state === "stopping" ? (
                <>🛑 {t("status.stopping")} <strong className="text-white">{activeGame.title}</strong>...</>
              ) : (
                <>● {t("status.running")}: <strong className="text-white">{activeGame.title}</strong> ({formatDuration ? formatDuration(elapsedSeconds || 0) : `${elapsedSeconds || 0}s`})</>
              )}
            </span>
            {handleKillRunningGame && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleKillRunningGame();
                }}
                className="ml-2 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer"
                title={t("status.kill_game_title")}
              >
                {t("status.kill_game")}
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-4">
          {/* Gamepad Connection Badge */}
          <div
            className={`flex items-center gap-2.5 px-4 py-2 rounded-full border text-xs font-bold transition-all ${
              gamepadConnected
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                : "border-slate-700/40 text-slate-400"
            }`}
            style={{ backgroundColor: !gamepadConnected ? "var(--bg-card)" : undefined }}
          >
            <Gamepad2 className={`w-4 h-4 ${gamepadConnected ? "animate-pulse" : ""}`} />
            <span>{gamepadConnected ? gamepadName : "Controller pronto (Gamepad API)"}</span>
          </div>

          {/* Virtual Keyboard / Search Shortcut */}
          <button
            onClick={() => {
              soundEffects.playSelect();
              setShowVirtualKeyboard(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold text-white transition-all shadow-md group hover:border-white/40"
            style={{
              backgroundColor: searchQuery ? "var(--accent-primary)" : "var(--bg-card)",
              borderColor: searchQuery ? "var(--accent-primary)" : "var(--border-color)",
              boxShadow: searchQuery ? `0 0 15px var(--accent-glow)` : undefined,
            }}
            title="Apri Tastiera Virtuale / Cerca nella Libreria (Y)"
          >
            <Search className="w-4 h-4" />
            <span>{searchQuery ? `Ricerca: "${searchQuery}"` : "Cerca"}</span>
            <span className="w-5 h-5 rounded-full bg-black/40 border border-white/20 flex items-center justify-center text-[10px] font-black text-amber-300">
              Y
            </span>
          </button>

          {/* Sound Effects Toggle Button */}
          <button
            onClick={handleToggleSound}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold text-white transition-all shadow-md hover:bg-white/10"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: soundEnabled ? "var(--text-primary)" : "var(--text-muted)",
            }}
            title={
              soundEnabled
                ? "Effetti sonori UI attivi (Clicca per silenziare)"
                : "Effetti sonori UI mutati (Clicca per attivare)"
            }
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
            <span>{soundEnabled ? "Audio ON" : "Audio OFF"}</span>
          </button>

          {/* Theme Shortcut */}
          <button
            onClick={() => {
              soundEffects.playSelect();
              setShowThemeModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold text-white transition-all shadow-md"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          >
            <Palette className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />
            <span>Tema: {currentTheme.name}</span>
          </button>

          {/* Plugin Shortcut */}
          <button
            onClick={() => {
              loadProvidersAndConfig();
              setShowPluginModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold text-white transition-all shadow-md"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          >
            <Puzzle className="w-4 h-4 text-indigo-400" />
            <span>Plugin Metadati</span>
          </button>

          {/* Exit Fullscreen */}
          <button
            type="button"
            onClick={toggleBigPicture}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-lg shrink-0"
            style={{
              backgroundColor: "var(--accent-primary)",
              boxShadow: `0 0 15px var(--accent-glow)`,
            }}
          >
            <Minimize2 className="w-4 h-4" />
            <span>{t("big_picture.exit_hint")}</span>
          </button>

          {/* Big Picture Window Controls */}
          <div
            className="flex items-center gap-1 shrink-0 ml-2 pl-2 border-l border-white/10 z-50"
            data-no-drag="true"
          >
            <button
              type="button"
              onClick={handleMinimize}
              className="w-8 h-8 rounded-lg hover:bg-white/10 active:bg-white/20 flex items-center justify-center transition-all cursor-pointer text-slate-400 hover:text-white"
              title={t("big_picture.minimize")}
              data-no-drag="true"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-lg hover:bg-rose-600 hover:text-white active:bg-rose-700 flex items-center justify-center transition-all cursor-pointer text-slate-400"
              title={t("big_picture.close")}
              data-no-drag="true"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* CATEGORY SELECTOR PILLS (LB / RB SWITCHABLE) */}
      <div className="relative z-20 flex items-center justify-center gap-2 px-10 my-4">
        <span
          className="text-[11px] font-black tracking-widest px-2 py-1 rounded border"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-muted)",
          }}
        >
          LB
        </span>
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          {[
            { id: "all", label: t("sidebar.all_games"), count: counts.total },
            { id: "installed", label: t("sidebar.installed"), count: counts.installed },
            { id: "recent", label: t("sidebar.recent"), count: counts.recent },
            { id: "favorites", label: t("sidebar.favorites"), count: counts.favorites },
            { id: "steam", label: "Steam", count: counts.steam },
            { id: "epic", label: "Epic Games", count: counts.epic },
            { id: "gog", label: "GOG Galaxy", count: counts.gog },
            { id: "xbox", label: "Xbox", count: counts.xbox || 0 },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => {
                soundEffects.playNav();
                setActiveFilter(f.id);
                setFocusedIndex(0);
              }}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-extrabold transition-all border"
              style={{
                backgroundColor: activeFilter === f.id ? "var(--accent-primary)" : "var(--bg-card)",
                borderColor: activeFilter === f.id ? "var(--accent-primary)" : "var(--border-color)",
                color: activeFilter === f.id ? "#ffffff" : "var(--text-muted)",
                boxShadow: activeFilter === f.id ? `0 0 15px var(--accent-glow)` : undefined,
              }}
            >
              {(f.id === "steam" || f.id === "epic" || f.id === "gog" || f.id === "xbox") && (
                <StoreIcon library={f.id} className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{f.label}</span>
              <span className="opacity-70 font-mono text-[11px]">({f.count})</span>
            </button>
          ))}
        </div>
        <span
          className="text-[11px] font-black tracking-widest px-2 py-1 rounded border"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-muted)",
          }}
        >
          RB
        </span>
      </div>

      {/* MAIN HERO STAGE */}
      <div className="relative z-10 flex-1 flex flex-col justify-end px-16 pb-8">
        <section data-omnis="bigpicture.hero" className="max-w-3xl mb-8 space-y-4">
          <div className="flex items-center gap-3">
            {focusedGame && (
              <StoreBadge library={focusedGame.library} showName={true} className="py-1 px-3 text-xs" />
            )}
            {focusedGame?.is_installed && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t("big_picture.installed")}
              </span>
            )}
            {focusedGame?.critic_score && (
              <span className="px-3 py-1 rounded-md text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                ★ {focusedGame.critic_score} METACRITIC
              </span>
            )}
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              {t("game_details.playtime")}:{" "}
              <strong className="text-white">{focusedGame?.playtime_formatted}</strong>
            </span>
          </div>

          <h1 data-omnis="bigpicture.title" className="text-4xl md:text-5xl font-black text-white tracking-tight drop-shadow-md">
            {focusedGame?.title}
          </h1>

          <p
            className="text-sm line-clamp-2 leading-relaxed max-w-2xl font-normal drop-shadow"
            style={{ color: "var(--text-muted)" }}
          >
            {focusedGame?.description || t("big_picture.no_desc")}
          </p>

          {/* ACTION BUTTONS WITH CONTROLLER HINTS */}
          <div className="flex items-center gap-4 pt-2">
            {isFocusedGameRunning ? (
              <>
                <button
                  disabled
                  className="flex items-center gap-3 px-8 py-4 rounded-2xl text-base font-black text-emerald-200 bg-emerald-600/30 border border-emerald-500/50 shadow-2xl cursor-default"
                >
                  <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                  <span>
                    {t("big_picture.running")} (
                    {formatDuration
                      ? formatDuration(elapsedSeconds || 0)
                      : `${elapsedSeconds || 0}s`}
                    )
                  </span>
                </button>

                {handleKillRunningGame && (
                  <button
                    type="button"
                    onClick={handleKillRunningGame}
                    className="flex items-center gap-3 px-8 py-4 rounded-2xl text-base font-black text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 border border-rose-400/50 shadow-2xl shadow-rose-950/50 transition-all hover:scale-105 active:opacity-90 cursor-pointer"
                    title={t("big_picture.kill_game_title")}
                  >
                    <Square className="w-5 h-5 fill-white" />
                    <span>{t("big_picture.kill_game")}</span>
                    <span className="w-6 h-6 rounded-full bg-black/40 flex items-center justify-center text-[10px] font-black border border-white/20">
                      K
                    </span>
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => focusedGame && handleLaunch(focusedGame.id)}
                className="flex items-center gap-3 px-8 py-4 rounded-2xl text-base font-black text-white transition-all hover:brightness-110 active:opacity-90 shadow-2xl"
                style={{
                  backgroundColor: "var(--accent-primary)",
                  boxShadow: `0 0 30px var(--accent-glow)`,
                }}
              >
                {focusedGame?.is_installed ? (
                  <>
                    <Play className="w-5 h-5 fill-white" />
                    <span>{t("big_picture.play_action")}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5 text-white" />
                    <span>{t("game_details.install_now")}</span>
                  </>
                )}
                <span className="w-6 h-6 rounded-full bg-black/30 flex items-center justify-center text-[11px] font-black border border-white/20">
                  A
                </span>
              </button>
            )}

            <button
              onClick={() => {
                soundEffects.playSelect();
                setShowFullscreenDetails(true);
              }}
              className="flex items-center gap-2.5 px-6 py-4 rounded-2xl text-white text-sm font-bold border transition-all hover:bg-white/10 active:opacity-90 backdrop-blur-md"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <Info className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />
              <span>{t("big_picture.details_action")}</span>
              <span className="w-5 h-5 rounded-full bg-black/30 flex items-center justify-center text-[10px] font-black border border-white/20">
                X
              </span>
            </button>

            <button
              onClick={() => {
                soundEffects.playSelect();
                handleSync();
              }}
              className="flex items-center gap-2.5 px-6 py-4 rounded-2xl text-white text-sm font-bold border transition-all backdrop-blur-md"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-white" : ""}`} />
              <span>{t("common.refresh")}</span>
            </button>
          </div>

          {/* Declarative Plugin Slot */}
          <Slot name="bigpicture.hero" gameId={focusedGame?.id} />
        </section>

        {/* HORIZONTAL CAROUSEL SHELF */}
        <div className="w-full">
          <div
            className="flex items-center justify-between mb-3 text-xs font-bold"
            style={{ color: "var(--text-muted)" }}
          >
            <span>{t("big_picture.catalog_title", { count: filteredGames.length })}</span>
            <span>{t("big_picture.nav_hint")}</span>
          </div>

          <div
            ref={carouselRef}
            className="flex items-center gap-6 overflow-x-auto pb-4 pt-2 px-2 scrollbar-none scroll-smooth"
          >
            {filteredGames.map((game, idx) => {
              const isFocused = idx === focusedIndex;
              return (
                <div
                  key={game.id}
                  onClick={() => {
                    soundEffects.playSelect();
                    setFocusedIndex(idx);
                    setSelectedGame(game);
                    if (isFocused) {
                      setShowFullscreenDetails(true);
                    }
                  }}
                  onDoubleClick={() => {
                    soundEffects.playSelect();
                    setShowFullscreenDetails(true);
                  }}
                  className={`relative flex-shrink-0 w-44 aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 transform-gpu will-change-transform [backface-visibility:hidden] [transform:translateZ(0)] ${
                    isFocused
                      ? "scale-110 z-20 shadow-2xl ring-4"
                      : "scale-95 opacity-60 hover:opacity-90 hover:scale-100"
                  }`}
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: isFocused ? "var(--accent-primary)" : "var(--border-color)",
                    boxShadow: isFocused ? `0 0 30px var(--accent-glow)` : undefined,
                  }}
                >
                  <BigPictureCardCover game={game} />

                  <div className="absolute top-2.5 right-2.5">
                    <StoreBadge library={game.library} />
                  </div>

                  {isFocused && (
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 px-3 py-1 rounded-lg bg-black/90 text-center text-xs font-black text-white border border-white/20 truncate select-none [transform:translateZ(0)]">
                      {game.title}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* BOTTOM CONTROLLER LEGEND */}
      <footer
        className="relative z-20 h-14 backdrop-blur-xl border-t flex items-center justify-between px-10 text-xs font-bold"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        <div className="flex items-center gap-6">
          {isFocusedGameRunning ? (
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-black shadow">
                K
              </span>
              <span className="text-rose-400 font-bold">
                {t("big_picture.kill_game")}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black shadow">
                A
              </span>
              <span>{t("big_picture.launch_game")}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-black shadow">
              X
            </span>
            <span>{t("big_picture.details_sheet")}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-black shadow">
              Y
            </span>
            <span>{t("topbar.themes")}</span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-black border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              LB / RB
            </span>
            <span>{t("big_picture.change_category")}</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-black border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              SELECT / F11
            </span>
            <span>{t("big_picture.return_desktop")}</span>
          </div>
        </div>
      </footer>

      {/* TRUE FULLSCREEN GAME DETAILS VIEW */}
      {showFullscreenDetails && activeDetailGame && (
        <div
          className="fixed inset-0 z-50 flex flex-col w-screen h-screen overflow-hidden animate-in fade-in duration-200 select-none"
          style={{ backgroundColor: "var(--bg-base)" }}
        >
          {/* Ambient Backdrop Layer */}
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            {activeDetailGame.background_image ? (
              <img
                src={formatImageUrl(activeDetailGame.background_image) || activeDetailGame.background_image}
                alt=""
                className="w-full h-full object-cover filter blur-md scale-105 opacity-30"
              />
            ) : activeDetailGame.cover_image ? (
              <img
                src={formatImageUrl(activeDetailGame.cover_image) || activeDetailGame.cover_image}
                alt=""
                className="w-full h-full object-cover filter blur-2xl scale-110 opacity-20"
              />
            ) : null}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to bottom, rgba(2,6,23,0.75) 0%, rgba(2,6,23,0.92) 40%, var(--bg-base) 100%)`,
              }}
            />
          </div>

          {/* 10-Foot Top Navigation Header */}
          <header
            onMouseDown={handleStartDragging}
            onDoubleClick={handleToggleMaximize}
            data-tauri-drag-region
            className="relative z-20 flex items-center justify-between px-10 py-5 border-b shrink-0 backdrop-blur-xl"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
            }}
          >
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  soundEffects.playSelect();
                  setShowFullscreenDetails(false);
                }}
                className="flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-bold border transition-all hover:scale-105 active:scale-95 shadow-md cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <ArrowLeft className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />
                <span>{t("big_picture.back_close")}</span>
              </button>
              <div
                className="flex items-center gap-2 text-xs font-semibold"
                style={{ color: "var(--text-muted)" }}
              >
                <span>OMNIS BIG PICTURE</span>
                <span>/</span>
                <StoreBadge library={activeDetailGame.library} showName={true} />
                <span>/</span>
                <span className="text-white font-bold">{activeDetailGame.title}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                soundEffects.playSelect();
                setShowFullscreenDetails(false);
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border hover:bg-white/10 transition-colors cursor-pointer"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
              title={t("big_picture.close_hint")}
            >
              ✕
            </button>
          </header>

          {/* Main Scrollable Canvas */}
          <div
            ref={detailsScrollRef}
            className="relative z-10 flex-1 overflow-y-auto px-10 sm:px-14 lg:px-20 py-8 space-y-8 scrollbar-thin"
          >
            {/* Hero Banner Section */}
            <div className="flex flex-col md:flex-row items-start gap-8 lg:gap-12">
              {/* 3D Boxart Cover */}
              <div className="w-48 sm:w-56 lg:w-64 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 shrink-0 bg-black/60 [transform:translateZ(0)]">
                <GameCardCover
                  coverImage={activeDetailGame.cover_image}
                  backgroundImage={activeDetailGame.background_image}
                  title={activeDetailGame.title}
                  imgClassName="w-full h-full object-cover [transform:translateZ(0)] [backface-visibility:hidden]"
                  placeholderClassName="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-b from-slate-800/80 via-slate-900/90 to-slate-950/95 font-black text-2xl text-white select-none"
                />
              </div>

              {/* Game Metadata & Hero Action Bar */}
              <div className="flex-1 min-w-0 space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <StoreBadge library={activeDetailGame.library} showName={true} />
                    {activeDetailGame.genres.map((g) => (
                      <span
                        key={g}
                        className="px-3 py-1 rounded-full text-xs font-bold border shadow-xs"
                        style={{
                          backgroundColor: "var(--bg-card)",
                          borderColor: "var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {g}
                      </span>
                    ))}
                  </div>

                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight drop-shadow-xl leading-tight">
                    {activeDetailGame.title}
                  </h1>

                  <p className="text-base font-semibold" style={{ color: "var(--text-muted)" }}>
                    {t("big_picture.developed_by")}{" "}
                    <span className="text-white font-bold">
                      {activeDetailGame.developers.join(", ") || "N/A"}
                    </span>
                    {activeDetailGame.publishers && activeDetailGame.publishers.length > 0 && (
                      <span className="text-slate-400"> • {activeDetailGame.publishers.join(", ")}</span>
                    )}
                  </p>
                </div>

                {/* Prominent Action Bar with Controller Prompts & Focus Highlights */}
                <div className="flex items-center gap-4 pt-2 flex-wrap">
                  {isFocusedGameRunning ? (
                    <>
                      <div className="flex items-center gap-3 px-6 py-4 rounded-2xl text-emerald-300 text-sm font-black bg-emerald-600/30 border border-emerald-500/50 shadow-xl">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                        <span>
                          {t("big_picture.running")} (
                          {formatDuration
                            ? formatDuration(elapsedSeconds || 0)
                            : `${elapsedSeconds || 0}s`}
                          )
                        </span>
                      </div>
                      {handleKillRunningGame && (
                        <button
                          type="button"
                          onClick={() => {
                            soundEffects.playSelect();
                            handleKillRunningGame();
                            setShowFullscreenDetails(false);
                          }}
                          className={`flex items-center gap-3 px-8 py-4 rounded-2xl text-white text-sm font-black bg-rose-600 hover:bg-rose-500 border border-rose-400/50 shadow-xl cursor-pointer transition-all ${
                            detailsFocusedSection === "hero" && heroFocusedButton === "launch"
                              ? "ring-4 ring-white shadow-[0_0_35px_rgba(244,63,94,0.6)] scale-105"
                              : "opacity-85"
                          }`}
                        >
                          <span className="w-5 h-5 rounded-full bg-black/40 text-white flex items-center justify-center text-[10px] font-black">
                            K
                          </span>
                          <Square className="w-4 h-4 fill-white" />
                          <span>{t("big_picture.kill_game_hint")}</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        soundEffects.playSelect();
                        handleLaunch(activeDetailGame.id);
                        setShowFullscreenDetails(false);
                      }}
                      className={`flex items-center gap-3.5 px-10 py-4 rounded-2xl text-white text-base font-black shadow-2xl transition-all cursor-pointer ${
                        detailsFocusedSection === "hero" && heroFocusedButton === "launch"
                          ? "ring-4 ring-white shadow-[0_0_35px_var(--accent-glow)] scale-105"
                          : "ring-2 ring-white/20 opacity-80 hover:opacity-100"
                      }`}
                      style={{
                        backgroundColor: "var(--accent-primary)",
                      }}
                    >
                      <span className="w-6 h-6 rounded-full bg-white/20 text-white flex items-center justify-center text-xs font-black shadow-inner">
                        A
                      </span>
                      <Play className="w-5 h-5 fill-white" />
                      <span>{t("big_picture.launch_game_hint")}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      soundEffects.playSelect();
                      setShowFullscreenDetails(false);
                    }}
                    className={`flex items-center gap-2.5 px-7 py-4 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${
                      detailsFocusedSection === "hero" && heroFocusedButton === "back"
                        ? "ring-4 ring-white shadow-xl scale-105 bg-white/20"
                        : "opacity-80 hover:opacity-100"
                    }`}
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <span className="w-5 h-5 rounded-full bg-white/10 text-white flex items-center justify-center text-[10px] font-black">
                      B
                    </span>
                    <span>{t("big_picture.close_hint")}</span>
                  </button>
                </div>

                {/* 3 Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 max-w-2xl">
                  <div
                    className="p-4 rounded-2xl border backdrop-blur-md"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("game_details.release_date")}
                    </span>
                    <p className="text-lg font-black text-white mt-1">
                      {activeDetailGame.release_date || "N/A"}
                    </p>
                  </div>
                  <div
                    className="p-4 rounded-2xl border backdrop-blur-md"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Metacritic
                    </span>
                    <p className="text-lg font-black text-amber-400 mt-1">
                      {activeDetailGame.critic_score ? `★ ${activeDetailGame.critic_score} / 100` : "N/A"}
                    </p>
                  </div>
                  <div
                    className="p-4 rounded-2xl border backdrop-blur-md"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("game_details.playtime")}
                    </span>
                    <p className="text-lg font-black text-emerald-400 mt-1">
                      {activeDetailGame.playtime_formatted}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Synopsis & Description Card */}
            <section
              className="p-6 sm:p-8 rounded-3xl border backdrop-blur-md space-y-3"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
              }}
            >
              <h3
                className="text-xs font-black tracking-widest uppercase flex items-center gap-2"
                style={{ color: "var(--text-muted)" }}
              >
                <Info className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />
                <span>{t("big_picture.synopsis_description")}</span>
              </h3>
              <p
                className="text-sm sm:text-base leading-relaxed max-h-56 overflow-y-auto pr-3 whitespace-pre-line"
                style={{ color: "var(--text-primary)" }}
              >
                {activeDetailGame.description || t("big_picture.no_desc")}
              </p>
            </section>

            {/* Achievements Showcase Section */}
            <section
              className={`p-6 sm:p-8 rounded-3xl border backdrop-blur-md space-y-4 transition-all duration-300 ${
                detailsFocusedSection === "achievements"
                  ? "ring-2 ring-indigo-500/60 shadow-2xl"
                  : ""
              }`}
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
              }}
            >
              <GameAchievementsGallery
                key={activeDetailGame.id}
                game={activeDetailGame}
                isBigPicture={true}
                focusedIndex={achievementsFocusedIndex}
                onFocusIndexChange={setAchievementsFocusedIndex}
                onTotalAchievementsChange={setTotalAchievements}
              />
            </section>
          </div>

          {/* 10-Foot Controller Hints Sticky Footer */}
          <footer
            className="relative z-20 flex items-center justify-between px-10 py-4 border-t shrink-0 backdrop-blur-xl select-none text-xs font-semibold"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            <div className="flex items-center gap-6">
              {detailsFocusedSection === "hero" ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black shadow">
                      A
                    </span>
                    <span>
                      {heroFocusedButton === "back"
                        ? t("big_picture.back_close")
                        : (isFocusedGameRunning ? t("big_picture.kill_game") : t("big_picture.launch_game"))}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-black shadow">
                      B
                    </span>
                    <span>{t("big_picture.back_close")}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-black border"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-color)",
                      }}
                    >
                      D-PAD SX / DX
                    </span>
                    <span>Seleziona Azione</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-black border"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-color)",
                      }}
                    >
                      D-PAD GIÙ
                    </span>
                    <span>Esplora Obiettivi</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-black border"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-color)",
                      }}
                    >
                      D-PAD SX / DX
                    </span>
                    <span>Scorri Obiettivi</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-black border"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-color)",
                      }}
                    >
                      D-PAD SU
                    </span>
                    <span>Torna ad Avvia Gioco</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-black shadow">
                      B
                    </span>
                    <span>{t("big_picture.back_close")}</span>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
              <span>Premi ESC o B per tornare alla libreria</span>
            </div>
          </footer>
        </div>
      )}

      {/* CONSOLE-STYLE FULLSCREEN TOAST NOTIFICATION */}
      {sessionToast && (
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-5 px-8 py-5 rounded-3xl bg-slate-900/95 border-2 border-emerald-400 text-white shadow-2xl shadow-emerald-500/40 backdrop-blur-2xl animate-in slide-in-from-top-10 duration-500 max-w-2xl">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center shrink-0">
            <Gamepad2 className="w-8 h-8 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-black uppercase tracking-widest text-emerald-300">
                {t("big_picture.session_ended")}
              </span>
            </div>
            <h3 className="text-xl font-black text-white truncate mt-0.5">{sessionToast.title}</h3>
            <p className="text-sm text-slate-300 font-semibold mt-0.5">
              {t("big_picture.played_time")} +{Math.max(1, Math.round(sessionToast.durationSeconds / 60))}{" "}
              {t("big_picture.minutes")} (
              {formatDuration
                ? formatDuration(sessionToast.durationSeconds)
                : `${sessionToast.durationSeconds}s`}
              )
            </p>
          </div>
          {onDismissToast && (
            <button
              onClick={onDismissToast}
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border border-white/20 hover:bg-white/10 active:opacity-80 transition-all text-slate-300 hover:text-white"
              title={t("common.close")}
            >
              ✕
            </button>
          )}
        </div>
      )}
    </main>
  );
}
