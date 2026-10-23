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
  Menu,
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
  homeFocusZone?: "carousel" | "topbar";
  setHomeFocusZone?: (zone: "carousel" | "topbar") => void;
  isMenuOpen?: boolean;
  setIsMenuOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  themes?: ThemeConfig[];
  onSelectTheme?: (theme: ThemeConfig) => void;
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
  homeFocusZone = "carousel",
  setHomeFocusZone,
  isMenuOpen = false,
  setIsMenuOpen,
  themes = [],
  onSelectTheme,
}: BigPictureViewProps) {
  const { locale } = useTranslation();
  const isFocusedGameRunning = activeGame?.game_id === focusedGame?.id;

  // Lock game for details view so navigation inside details never switches games underneath
  const [detailGame, setDetailGame] = React.useState<GameDto | null>(null);

  React.useEffect(() => {
    if (showFullscreenDetails && focusedGame) {
      setDetailGame(focusedGame);
    } else if (!showFullscreenDetails || !focusedGame) {
      setDetailGame(null);
    }
  }, [showFullscreenDetails, focusedGame]);

  // If there are no games matching the filter, automatically close fullscreen details
  React.useEffect(() => {
    if (filteredGames.length === 0 && showFullscreenDetails) {
      setShowFullscreenDetails(false);
    }
  }, [filteredGames.length, showFullscreenDetails, setShowFullscreenDetails]);

  const activeDetailGame = filteredGames.length > 0 ? (detailGame || focusedGame) : null;

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

  // Dropdown menu focused index
  const [menuFocusedIndex, setMenuFocusedIndex] = React.useState<number>(0);

  // Reset menu focus to 0 whenever the dropdown menu opens
  React.useEffect(() => {
    if (isMenuOpen) {
      setMenuFocusedIndex(0);
    }
  }, [isMenuOpen]);

  // Handle D-pad / Arrow navigation inside dropdown menu
  React.useEffect(() => {
    if (!isMenuOpen) return;

    const handleMenuNav = (e: Event) => {
      const customEvent = e as CustomEvent<{ direction: "up" | "down" | "left" | "right" }>;
      const dir = customEvent.detail?.direction;
      if (!dir) return;

      const TOTAL_MENU_ITEMS = 7;
      if (dir === "down") {
        setMenuFocusedIndex((prev) => (prev + 1) % TOTAL_MENU_ITEMS);
        soundEffects.playNav();
      } else if (dir === "up") {
        setMenuFocusedIndex((prev) => (prev <= 0 ? TOTAL_MENU_ITEMS - 1 : prev - 1));
        soundEffects.playNav();
      } else if (dir === "left" || dir === "right") {
        // Horizontal navigation inside menu items (for cycling settings inline)
        if (menuFocusedIndex === 3 && themes.length > 0 && onSelectTheme) {
          const curIdx = themes.findIndex((th) => th.id === currentTheme.id);
          const delta = dir === "right" ? 1 : -1;
          const nextIdx = (curIdx + delta + themes.length) % themes.length;
          soundEffects.playNav();
          onSelectTheme(themes[nextIdx]);
        } else if (menuFocusedIndex === 2) {
          // Toggle audio effects
          handleToggleSound();
        }
      }
    };

    window.addEventListener("omnis:menu-nav", handleMenuNav);
    return () => window.removeEventListener("omnis:menu-nav", handleMenuNav);
  }, [isMenuOpen, menuFocusedIndex, themes, currentTheme, onSelectTheme, handleToggleSound]);

  // Handle Button A / Enter inside dropdown menu
  React.useEffect(() => {
    if (!isMenuOpen) return;

    const handleMenuActionA = () => {
      soundEffects.playSelect();
      switch (menuFocusedIndex) {
        case 0: // Cerca nella libreria (virtual keyboard)
          setIsMenuOpen?.(false);
          setShowVirtualKeyboard(true);
          break;
        case 1: // Sincronizza libreria
          handleSync();
          break;
        case 2: // Effetti Sonori UI
          handleToggleSound();
          break;
        case 3: // Cambia Tema (inline cycle)
          if (themes.length > 0 && onSelectTheme) {
            const curIdx = themes.findIndex((th) => th.id === currentTheme.id);
            const nextIdx = (curIdx + 1) % themes.length;
            onSelectTheme(themes[nextIdx]);
          }
          break;
        case 4: // Plugin Metadati (inline refresh)
          loadProvidersAndConfig();
          break;
        case 5: // Torna alla Modalità Desktop
          setIsMenuOpen?.(false);
          toggleBigPicture();
          break;
        case 6: // Chiudi Menu
          setIsMenuOpen?.(false);
          break;
      }
    };

    window.addEventListener("omnis:menu-action-a", handleMenuActionA);
    return () => window.removeEventListener("omnis:menu-action-a", handleMenuActionA);
  }, [
    isMenuOpen,
    menuFocusedIndex,
    themes,
    currentTheme,
    onSelectTheme,
    handleToggleSound,
    handleSync,
    loadProvidersAndConfig,
    toggleBigPicture,
    setIsMenuOpen,
    setShowVirtualKeyboard,
  ]);

  return (
    <main
      data-omnis="bigpicture"
      className="relative flex flex-col h-screen w-screen overflow-hidden transition-colors duration-500 cursor-none pointer-events-none select-none"
      style={{ backgroundColor: "var(--bg-base)" }}
    >
      {/* Ambient Cinema Backdrop / Dynamic Video Trailer */}
      <VideoBackdrop
        game={focusedGame}
        theme={currentTheme}
        blurLevel={currentTheme.enable_video_backdrop ? "subtle" : "ambient"}
        isPaused={isGameRunning}
      />

      {/* 10-FOOT PLAYNITE-STYLE TOP BAR */}
      <header
        className="relative z-30 flex items-center justify-between px-10 py-4 border-b select-none"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
        }}
      >
        {/* Left: Playnite-style Menu Button */}
        <div className="flex items-center gap-4">
          <div
            className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl border-2 transition-all duration-200 ${
              homeFocusZone === "topbar" || isMenuOpen
                ? "scale-105 shadow-2xl"
                : "opacity-85"
            }`}
            style={{
              backgroundColor:
                homeFocusZone === "topbar" || isMenuOpen
                  ? "var(--accent-primary)"
                  : "var(--bg-card)",
              borderColor:
                homeFocusZone === "topbar" || isMenuOpen
                  ? "var(--accent-glow, #6366f1)"
                  : "var(--border-color)",
              boxShadow:
                homeFocusZone === "topbar" || isMenuOpen
                  ? "0 0 25px var(--accent-glow)"
                  : undefined,
              color:
                homeFocusZone === "topbar" || isMenuOpen
                  ? "#ffffff"
                  : "var(--text-primary)",
            }}
          >
            <Menu className="w-5 h-5 text-white" />
            <span className="font-black text-sm tracking-wide uppercase">Menu</span>
            <span
              className={`ml-1 text-[11px] font-black px-2 py-0.5 rounded-md border ${
                homeFocusZone === "topbar" || isMenuOpen
                  ? "bg-black/40 border-white/40 text-amber-300"
                  : "bg-white/10 border-white/10 text-slate-300"
              }`}
            >
              {homeFocusZone === "topbar" ? "A" : "SELECT"}
            </span>
          </div>

          {/* Omnis Big Picture Brand / Logo subtle pill */}
          <div className="hidden md:flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border border-white/10 bg-white/5">
            <Tv className="w-4 h-4 text-white/70" />
            <span className="font-bold text-xs tracking-wider text-white/80 uppercase">
              Omnis Big Picture
            </span>
          </div>
        </div>

        {/* Center: Live Running Game Indicator (if active) */}
        {activeGame && (
          <div
            className={`flex items-center gap-3 px-5 py-2 rounded-full border-2 text-xs font-black shadow-xl backdrop-blur-md ${
              activeGame.state === "launching"
                ? "bg-amber-500/20 border-amber-500/60 text-amber-300 animate-pulse"
                : activeGame.state === "stopping"
                ? "bg-rose-500/20 border-rose-500/60 text-rose-300"
                : "bg-emerald-500/20 border-emerald-500/60 text-emerald-300 animate-pulse"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                activeGame.state === "launching"
                  ? "bg-amber-400"
                  : activeGame.state === "stopping"
                  ? "bg-rose-400"
                  : "bg-emerald-400 animate-ping"
              }`}
            />
            <span>
              {activeGame.state === "launching" ? (
                <>⏳ {t("status.launching")} <strong className="text-white">{activeGame.title}</strong></>
              ) : activeGame.state === "stopping" ? (
                <>🛑 {t("status.stopping")} <strong className="text-white">{activeGame.title}</strong></>
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
                className="ml-2 px-2.5 py-0.5 rounded-lg bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider shadow"
              >
                {t("status.kill_game")}
              </button>
            )}
          </div>
        )}

        {/* Right: Controller status and active search filter */}
        <div className="flex items-center gap-3">
          {searchQuery && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border"
              style={{
                backgroundColor: "var(--accent-primary)",
                borderColor: "var(--accent-glow)",
                color: "#fff",
              }}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Filtro: "{searchQuery}"</span>
            </div>
          )}

          <div
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-bold transition-all ${
              gamepadConnected
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                : "border-white/10 text-slate-400"
            }`}
            style={{ backgroundColor: "var(--bg-card)" }}
          >
            <Gamepad2 className={`w-3.5 h-3.5 ${gamepadConnected ? "animate-pulse" : ""}`} />
            <span>{gamepadConnected ? gamepadName : "Controller pronto"}</span>
          </div>
        </div>
      </header>

      {/* PLAYNITE-STYLE FULLSCREEN DROPDOWN MENU */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-start pt-20 pl-10 bg-black/60 backdrop-blur-md">
          <div
            className="w-[420px] rounded-3xl border-2 p-3 shadow-2xl flex flex-col gap-1.5"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
              boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 35px var(--accent-glow)",
            }}
          >
            {/* Menu Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shadow"
                  style={{ backgroundColor: "var(--accent-primary)" }}
                >
                  <Tv className="w-4 h-4 text-white" />
                </div>
                <span className="font-extrabold text-sm tracking-wider text-white uppercase">
                  Menu Principale
                </span>
              </div>
              <span className="text-[11px] font-black text-slate-400">
                (B) Chiudi
              </span>
            </div>

            {/* Menu Items */}
            <div className="flex flex-col gap-1 py-1">
              {[
                {
                  id: "search",
                  icon: Search,
                  label: "Cerca nella Libreria",
                  subtitle: searchQuery ? `Filtro: "${searchQuery}"` : "Cerca giochi con la tastiera virtuale",
                  badge: searchQuery ? "Attivo" : undefined,
                  badgeVariant: "emerald",
                  actionKey: "A",
                },
                {
                  id: "sync",
                  icon: RefreshCw,
                  isSpinning: isSyncing,
                  label: "Sincronizza Libreria",
                  subtitle: isSyncing ? "Sincronizzazione in corso..." : "Scansiona Steam, Epic, GOG",
                  badge: isSyncing ? "Sync..." : undefined,
                  badgeVariant: "emerald",
                  actionKey: "A",
                },
                {
                  id: "sound",
                  icon: soundEnabled ? Volume2 : VolumeX,
                  label: "Effetti Sonori UI",
                  subtitle: soundEnabled ? "Feedback sonoro attivo" : "Audio dell'interfaccia silenziato",
                  badge: soundEnabled ? "ON" : "OFF",
                  badgeVariant: soundEnabled ? "emerald" : "slate",
                  actionKey: "A",
                },
                {
                  id: "theme",
                  icon: Palette,
                  label: "Tema dell'Interfaccia",
                  subtitle: currentTheme.name,
                  badge: currentTheme.name,
                  badgeVariant: "default",
                  actionKey: "◄/►",
                },
                {
                  id: "plugins",
                  icon: Puzzle,
                  label: "Plugin e Metadati",
                  subtitle: "Ricarica configurazione scraper metadati",
                  actionKey: "A",
                },
                {
                  id: "desktop",
                  icon: Minimize2,
                  label: "Torna alla Modalità Desktop",
                  subtitle: "Passa alla finestra launcher standard",
                  badge: "Desktop",
                  badgeVariant: "slate",
                  actionKey: "A",
                },
                {
                  id: "close",
                  icon: X,
                  label: "Chiudi Menu",
                  subtitle: "Torna alla navigazione dei giochi",
                  actionKey: "B",
                },
              ].map((item, idx) => {
                const isFocused = menuFocusedIndex === idx;
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition-all duration-150 ${
                      isFocused
                        ? "scale-[1.02] border-white/60 shadow-lg"
                        : "border-transparent opacity-80"
                    }`}
                    style={{
                      backgroundColor: isFocused ? "var(--accent-primary)" : "transparent",
                      borderColor: isFocused ? "var(--accent-glow, #ffffff)" : "transparent",
                      boxShadow: isFocused ? "0 0 20px var(--accent-glow)" : undefined,
                      color: isFocused ? "#ffffff" : "var(--text-primary)",
                    }}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isFocused ? "bg-white/20 text-white" : "bg-white/5 text-slate-300"
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${item.isSpinning ? "animate-spin" : ""}`} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-sm truncate leading-tight">
                          {item.label}
                        </span>
                        <span
                          className={`text-[11px] truncate leading-normal ${
                            isFocused ? "text-white/85" : "text-slate-400"
                          }`}
                        >
                          {item.subtitle}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {item.badge && (
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
                            item.badgeVariant === "emerald"
                              ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                              : item.badgeVariant === "slate"
                              ? "bg-slate-700/50 border-slate-600 text-slate-300"
                              : "bg-white/10 border-white/20 text-white"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                      {isFocused && (
                        <span className="w-5 h-5 rounded-full bg-white/20 border border-white/40 flex items-center justify-center text-[10px] font-black text-amber-300 shadow">
                          {item.actionKey}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Menu Footer Navigation Hint */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 text-[10px] font-bold text-slate-400">
              <span>▲/▼ Sposta</span>
              <span>(A) Seleziona</span>
              <span>(B) Esci</span>
            </div>
          </div>
        </div>
      )}

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

      {/* MAIN HERO STAGE OR EMPTY STATE */}
      {filteredGames.length === 0 ? (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-16 text-center">
          <div
            className="p-10 rounded-3xl border flex flex-col items-center max-w-lg space-y-4 shadow-2xl backdrop-blur-xl"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
            }}
          >
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <Search className="w-10 h-10 text-slate-400" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-black text-white tracking-wide">
                Nessun gioco trovato
              </h2>
              <p className="text-sm font-medium leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {searchQuery
                  ? `Nessun risultato corrisponde alla ricerca "${searchQuery}". Prova con un termine diverso o premi (Y) per modificare il filtro.`
                  : "Nessun gioco presente in questa categoria o filtro selezionato. Usa LB / RB per cambiare categoria."}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  soundEffects.playSelect();
                  setShowVirtualKeyboard(true);
                }}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-bold text-white transition-all shadow-md"
                style={{
                  backgroundColor: "var(--accent-primary)",
                  boxShadow: "0 0 20px var(--accent-glow)",
                }}
              >
                <Search className="w-4 h-4" />
                <span>{searchQuery ? "Modifica ricerca (Y)" : "Cerca nella libreria (Y)"}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
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
      )}

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
          {filteredGames.length > 0 && (
            <>
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
            </>
          )}

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
