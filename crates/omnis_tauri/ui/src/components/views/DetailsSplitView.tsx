import React from "react";
import { createPortal } from "react-dom";
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Play,
  Download,
  Sparkles,
  Pencil,
  BookOpen,
  SlidersHorizontal,
  ExternalLink,
  Square,
  Clock,
  RefreshCw,
  Settings2,
  ChevronDown,
  FolderOpen,
  Monitor,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { ActiveGameSession, GameDto, ThemeConfig, ViewMode, formatImageUrl } from "../../types";
import { StoreBadge } from "../StoreBadge";
import { VideoBackdrop } from "../common/VideoBackdrop";
import { Slot } from "../common/Slot";
import { GameCardCover } from "../common/GameCardCover";
import { GameAchievementsGallery } from "../achievements";

function ListThumbCover({ thumb, title }: { thumb?: string | null; title: string }) {
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setHasError(false);
  }, [thumb]);

  if (!thumb || hasError) {
    return (
      <div
        className="w-full h-full flex items-center justify-center text-[10px] font-black select-none"
        style={{
          backgroundColor: "var(--accent-glow)",
          color: "var(--accent-primary)",
        }}
      >
        {title ? title.slice(0, 2).toUpperCase() : "??"}
      </div>
    );
  }

  return (
    <img
      src={thumb}
      alt=""
      className="w-full h-full object-cover"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

interface DetailsSplitViewProps {
  currentTheme?: ThemeConfig;
  selectedGame: GameDto;
  setSelectedGame: (game: GameDto) => void;
  detailsSidebarOpen: boolean;
  setDetailsSidebarOpen: (open: boolean) => void;
  detailsSearchQuery: string;
  setDetailsSearchQuery: (query: string) => void;
  detailsFilteredGames: GameDto[];
  setViewMode: (mode: ViewMode) => void;
  handleOpenContextMenu: (e: React.MouseEvent, game: GameDto) => void;
  handleLaunch: (gameId: string) => void;
  handleEnrichSingleGame: (gameId: string) => void;
  handleRefreshHltb?: (gameId: string) => void;
  isEnrichingSingle: boolean;
  setGameToEdit: (game: any) => void;
  setShowEditorModal: (show: boolean) => void;
  setGameToResolve: (game: any) => void;
  setShowResolutionModal: (show: boolean) => void;
  t: (key: string, params?: Record<string, any>) => string;
  isGameRunning?: boolean;
  activeGame?: ActiveGameSession | null;
  elapsedSeconds?: number;
  formatDuration?: (seconds: number) => string;
  handleKillRunningGame?: () => void;
  activeFilter?: string;
  setActiveFilter?: (filter: string) => void;
  isFilterActive?: (filterId: string) => boolean;
  handleOpenInstallDir?: (gameId: string) => void;
  handleCreateShortcut?: (gameId: string) => void;
  handleVerifyFiles?: (gameId: string) => void;
  handleOpenUninstallModal?: (game: GameDto) => void;
  handleRemoveFromLibrary?: (gameId: string) => void;
}

export default function DetailsSplitView({
  currentTheme,
  selectedGame,
  setSelectedGame,
  detailsSidebarOpen,
  setDetailsSidebarOpen,
  detailsSearchQuery,
  setDetailsSearchQuery,
  detailsFilteredGames,
  setViewMode,
  handleOpenContextMenu,
  handleLaunch,
  handleEnrichSingleGame,
  handleRefreshHltb,
  isEnrichingSingle,
  setGameToEdit,
  setShowEditorModal,
  setGameToResolve,
  setShowResolutionModal,
  t,
  isGameRunning = false,
  activeGame,
  elapsedSeconds,
  formatDuration,
  handleKillRunningGame,
  activeFilter,
  setActiveFilter,
  isFilterActive,
  handleOpenInstallDir,
  handleCreateShortcut,
  handleVerifyFiles,
  handleOpenUninstallModal,
  handleRemoveFromLibrary,
}: DetailsSplitViewProps) {
  const isSelectedGameRunning = activeGame?.game_id === selectedGame.id;
  const manageButtonRef = React.useRef<HTMLButtonElement>(null);
  const [showManageMenu, setShowManageMenu] = React.useState(false);
  const [menuPosition, setMenuPosition] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const toggleManageMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showManageMenu && manageButtonRef.current) {
      const rect = manageButtonRef.current.getBoundingClientRect();
      const menuHeight = 260;
      const fitsBelow = rect.bottom + menuHeight <= window.innerHeight;
      const top = fitsBelow ? rect.bottom + 6 : Math.max(10, rect.top - menuHeight - 6);
      const left = Math.min(rect.left, window.innerWidth - 270);
      setMenuPosition({ top, left });
      setShowManageMenu(true);
    } else {
      setShowManageMenu(false);
    }
  };

  React.useEffect(() => {
    setShowManageMenu(false);
  }, [selectedGame.id]);

  React.useEffect(() => {
    if (!showManageMenu) return;
    const handleClose = () => setShowManageMenu(false);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("resize", handleClose);
    return () => {
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
    };
  }, [showManageMenu]);

  const handleFilterByGenre = (genre: string) => {
    if (!setActiveFilter) return;
    const gLower = genre.toLowerCase().trim();
    let target = `genre:${genre.trim()}`;
    if (gLower === "azione" || gLower === "action") target = "action";
    else if (gLower === "gdr" || gLower === "rpg") target = "rpg";
    else if (gLower === "strategia" || gLower === "strategy") target = "strategy";
    else if (gLower === "indie") target = "indie";

    setActiveFilter(target);
  };

  const isGenreActive = (genre: string) => {
    const gLower = genre.toLowerCase().trim();
    let target = `genre:${genre.trim()}`;
    if (gLower === "azione" || gLower === "action") target = "action";
    else if (gLower === "gdr" || gLower === "rpg") target = "rpg";
    else if (gLower === "strategia" || gLower === "strategy") target = "strategy";
    else if (gLower === "indie") target = "indie";

    if (isFilterActive) {
      return isFilterActive(target) || isFilterActive(genre.trim());
    }
    if (!activeFilter) return false;
    if (activeFilter === target) return true;
    if (activeFilter === "action" && (gLower === "azione" || gLower === "action")) return true;
    if (activeFilter === "rpg" && (gLower === "gdr" || gLower === "rpg")) return true;
    if (activeFilter === "strategy" && (gLower === "strategia" || gLower === "strategy")) return true;
    if (activeFilter === "indie" && gLower === "indie") return true;
    return false;
  };

  const getCompletionStatusInfo = (status?: string | null) => {
    switch (status) {
      case "Playing":
        return {
          label: "In corso",
          color: "text-sky-300",
          bg: "bg-sky-500/15",
          border: "border-sky-500/30",
          dot: "bg-sky-400",
        };
      case "Completed":
        return {
          label: "Completato 100%",
          color: "text-emerald-300",
          bg: "bg-emerald-500/15",
          border: "border-emerald-500/30",
          dot: "bg-emerald-400",
        };
      case "Beaten":
        return {
          label: "Finito",
          color: "text-purple-300",
          bg: "bg-purple-500/15",
          border: "border-purple-500/30",
          dot: "bg-purple-400",
        };
      case "Backlog":
        return {
          label: "Backlog",
          color: "text-amber-300",
          bg: "bg-amber-500/15",
          border: "border-amber-500/30",
          dot: "bg-amber-400",
        };
      case "PlanToPlay":
        return {
          label: "Da iniziare",
          color: "text-indigo-300",
          bg: "bg-indigo-500/15",
          border: "border-indigo-500/30",
          dot: "bg-indigo-400",
        };
      case "Abandoned":
        return {
          label: "Abbandonato",
          color: "text-rose-300",
          bg: "bg-rose-500/15",
          border: "border-rose-500/30",
          dot: "bg-rose-400",
        };
      case "NotPlayed":
      default:
        return {
          label: t("game_details.not_played") || "Non giocato",
          color: "text-slate-300",
          bg: "bg-slate-500/15",
          border: "border-slate-500/30",
          dot: "bg-slate-400",
        };
    }
  };

  const handleFilterByCompletion = (status?: string | null) => {
    if (!setActiveFilter) return;
    const target = `completion:${status || "NotPlayed"}`;
    setActiveFilter(target);
  };
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Column: Titles Quick List (300px collapsible master panel) */}
      <div
        className={`border-r border-white/[0.06] flex flex-col transition-all duration-300 select-none ${
          detailsSidebarOpen ? "w-80 min-w-[300px] max-w-[320px]" : "w-11 min-w-[44px] max-w-[44px]"
        }`}
        style={{
          backgroundColor: "var(--bg-surface)",
        }}
      >
        {/* Master list header with search & collapse button */}
        <div
          className="p-2.5 border-b border-white/[0.06] flex items-center justify-between gap-2"
        >
          {detailsSidebarOpen ? (
            <>
              <div className="relative flex-1 flex items-center">
                <Search
                  className="w-3.5 h-3.5 absolute left-2.5 pointer-events-none"
                  style={{ color: "var(--text-muted)" }}
                />
                <input
                  type="text"
                  placeholder={t("game_details.filter_titles_placeholder")}
                  value={detailsSearchQuery}
                  onChange={(e) => setDetailsSearchQuery(e.target.value)}
                  className="w-full h-7 pl-8 pr-7 rounded-lg text-xs focus:outline-none border border-white/[0.08] bg-white/[0.03] text-slate-100 placeholder:text-slate-500 transition-colors focus:border-indigo-500/50"
                />
                {detailsSearchQuery && (
                  <button
                    onClick={() => setDetailsSearchQuery("")}
                    className="absolute right-2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setDetailsSidebarOpen(false)}
                className="p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
                title={t("game_details.collapse_sidebar")}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setDetailsSidebarOpen(true)}
              className="w-full py-1.5 flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              title={t("game_details.expand_sidebar")}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Active filter badge if any filter is active */}
        {detailsSidebarOpen && (isFilterActive ? !isFilterActive("all") : activeFilter && activeFilter !== "all") && (
          <div className="px-3 py-1.5 border-b border-indigo-500/20 bg-indigo-500/10 flex items-center justify-between text-[11px] text-indigo-300">
            <span className="truncate font-medium">
              Filtro: {activeFilter ? (activeFilter.startsWith("genre:") ? activeFilter.slice(6) : activeFilter.startsWith("completion:") ? activeFilter.slice(11) : activeFilter) : "Attivo"}
            </span>
            <button
              onClick={() => setActiveFilter && setActiveFilter("all")}
              className="p-0.5 hover:text-white transition-colors cursor-pointer"
              title="Azzera filtri"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Master list of games */}
        {detailsSidebarOpen && (
          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04] custom-scrollbar">
            {detailsFilteredGames.map((game) => {
              const isSelected = selectedGame.id === game.id;
              const thumb = game.icon_image || game.cover_image;

              return (
                <div
                  key={game.id}
                  onClick={() => setSelectedGame(game)}
                  onContextMenu={(e) => handleOpenContextMenu(e, game)}
                  className={`p-2.5 flex items-center gap-3 cursor-pointer transition-all ${
                    isSelected
                      ? "bg-white/[0.06] text-white border-l-2 border-indigo-400 shadow-xs"
                      : "hover:bg-white/[0.025] text-slate-300 border-l-2 border-transparent"
                  }`}
                >
                  <div
                    className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center border border-white/[0.08] shrink-0 shadow-xs"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                    }}
                  >
                    <ListThumbCover thumb={thumb} title={game.title} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-xs font-bold truncate block ${
                        isSelected ? "text-white" : "text-slate-300"
                      }`}
                      title={game.title}
                    >
                      {game.title}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StoreBadge library={game.library} className="py-0 px-1 text-[9px]" />
                      {activeGame?.game_id === game.id ? (
                        <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-300 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                          {t("status.running")}
                        </span>
                      ) : game.is_installed ? (
                        <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          {t("groups.installed")}
                        </span>
                      ) : null}
                      <span
                        className="text-[10px] font-mono ml-auto"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {game.playtime_formatted}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Column: Expanded Hero Details Panel */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Top Bar with Back Button & Breadcrumbs */}
        <div
          className="px-6 md:px-8 py-2.5 border-b border-white/[0.06] flex items-center justify-between shrink-0 z-20 backdrop-blur-md"
          style={{
            backgroundColor: "var(--bg-surface)",
          }}
        >
          <button
            onClick={() => setViewMode("grid")}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-xs font-bold text-white transition-all hover:bg-white/[0.08] hover:border-slate-400 active:opacity-90 shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" style={{ color: "var(--accent-primary)" }} />
            <span>{t("game_details.back_to_grid")}</span>
          </button>

          <div
            className="flex items-center gap-2 text-xs font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            <span>{t("game_details.breadcrumb_library")}</span>
            <span>/</span>
            <StoreBadge library={selectedGame.library} showName={true} />
            <span>/</span>
            <span className="text-white font-bold">{selectedGame.title}</span>
          </div>
        </div>

        {/* Hero Background Full-Width with Ambient Gradient / Video Trailer */}
        <section
          data-omnis="details.hero"
          className="relative min-h-[460px] md:min-h-[500px] lg:min-h-[540px] h-auto w-full overflow-hidden flex items-end p-6 md:p-8 lg:p-10 shrink-0"
        >
          {currentTheme ? (
            <VideoBackdrop
              game={selectedGame}
              theme={currentTheme}
              blurLevel="none"
              videoOpacity={1.0}
              objectPosition="center 20%"
              gradientOverlay="hero"
              isPaused={isGameRunning}
            />
          ) : (
            <>
              {selectedGame.background_image ? (
                <img
                  key={selectedGame.background_image}
                  src={formatImageUrl(selectedGame.background_image) || undefined}
                  alt="Hero"
                  className="absolute inset-0 w-full h-full object-cover object-[center_20%]"
                />
              ) : selectedGame.cover_image ? (
                <img
                  key={selectedGame.cover_image}
                  src={formatImageUrl(selectedGame.cover_image) || undefined}
                  alt="Hero"
                  className="absolute inset-0 w-full h-full object-cover object-[center_20%] filter blur-md scale-110 opacity-40"
                />
              ) : (
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    background: `linear-gradient(135deg, var(--accent-primary), var(--bg-base))`,
                  }}
                />
              )}
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(to top, var(--bg-base) 0%, rgba(9, 12, 20, 0.85) 16%, rgba(9, 12, 20, 0.25) 36%, transparent 60%)`,
                }}
              />
            </>
          )}

          <div className="relative z-10 flex items-end gap-5 md:gap-6 w-full pt-4">
            {/* 3D Boxart Cover with Border & Shadow */}
            <div className="w-32 sm:w-36 md:w-40 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 flex-shrink-0 bg-black/60 [transform:translateZ(0)]">
              <GameCardCover
                coverImage={selectedGame.cover_image}
                backgroundImage={selectedGame.background_image}
                title={selectedGame.title}
                imgClassName="w-full h-full object-cover shadow-inner [transform:translateZ(0)] [backface-visibility:hidden]"
                placeholderClassName="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-b from-slate-800/80 via-slate-900/90 to-slate-950/95 select-none [transform:translateZ(0)]"
              />
            </div>

            {/* Title, Badges & Hero Actions */}
            <div className="space-y-3.5 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <StoreBadge library={selectedGame.library} showName={true} className="py-1 px-3 text-xs" />
                {isSelectedGameRunning && (
                  <span className={`px-3 py-1 rounded-full text-xs font-black border shadow-lg flex items-center gap-1.5 ${
                    activeGame?.state === "launching"
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-amber-950/50 animate-pulse"
                      : activeGame?.state === "stopping"
                      ? "bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-rose-950/50"
                      : "bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-emerald-950/50 animate-pulse"
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      activeGame?.state === "launching" ? "bg-amber-400" : activeGame?.state === "stopping" ? "bg-rose-400" : "bg-emerald-400 animate-ping"
                    }`} />
                    {activeGame?.state === "launching"
                      ? `⏳ ${t("status.launching")}`
                      : activeGame?.state === "stopping"
                      ? `🛑 ${t("status.stopping")}`
                      : `● ${t("status.running")} (${formatDuration ? formatDuration(elapsedSeconds || 0) : `${elapsedSeconds || 0}s`})`}
                  </span>
                )}
                {selectedGame.is_installed ? (
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {t("status.installed")}
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-medium bg-slate-800/60 text-slate-400 border border-slate-700/60">
                    {t("status.available")}
                  </span>
                )}
                {selectedGame.critic_score && (
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
                    ★ {selectedGame.critic_score}
                  </span>
                )}
                {/* Completion Status Badge */}
                {(() => {
                  const statusInfo = getCompletionStatusInfo(selectedGame.completion_status);
                  const isFiltered = isFilterActive
                    ? isFilterActive(`completion:${selectedGame.completion_status || "NotPlayed"}`)
                    : activeFilter === `completion:${selectedGame.completion_status || "NotPlayed"}`;
                  return (
                    <button
                      type="button"
                      onClick={() => handleFilterByCompletion(selectedGame.completion_status)}
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold border shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                        isFiltered
                          ? "ring-2 ring-indigo-400 " + statusInfo.bg + " " + statusInfo.border + " " + statusInfo.color
                          : statusInfo.bg + " " + statusInfo.border + " " + statusInfo.color
                      }`}
                      title={`Filtra per stato: ${statusInfo.label}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                      <span>{statusInfo.label}</span>
                    </button>
                  );
                })()}
                {selectedGame.series && (
                  <span
                    className="px-2.5 py-0.5 rounded text-[10px] font-bold border"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {selectedGame.series}
                  </span>
                )}
              </div>

              <h1 data-omnis="details.title" className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight drop-shadow-md leading-tight">
                {selectedGame.title}
              </h1>

              {/* Genre Badges (Clickable Filters) */}
              {selectedGame.genres && selectedGame.genres.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {selectedGame.genres.map((genre) => {
                    const active = isGenreActive(genre);
                    return (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => handleFilterByGenre(genre)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-sm ${
                          active
                            ? "bg-indigo-600 border-indigo-400 text-white shadow-indigo-500/30"
                            : "bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border-white/[0.08] hover:border-indigo-400/50"
                        }`}
                        title={`Filtra per genere: ${genre}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white" : "bg-indigo-400"}`} />
                        <span>{genre}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Action Buttons Bar */}
              <div data-omnis="details.actions" className="flex flex-wrap items-center gap-2 sm:gap-2.5 pt-2">
                {isSelectedGameRunning ? (
                  <>
                    <button
                      disabled
                      className="flex items-center gap-2.5 px-6 py-3 rounded-xl font-black text-xs text-emerald-200 bg-emerald-600/30 border border-emerald-500/50 shadow-xl cursor-default"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>{t("status.running")}... ({formatDuration ? formatDuration(elapsedSeconds || 0) : `${elapsedSeconds || 0}s`})</span>
                    </button>

                    {handleKillRunningGame && (
                      <button
                        type="button"
                        onClick={handleKillRunningGame}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 border border-rose-400/50 shadow-xl shadow-rose-950/40 transition-all hover:scale-105 active:opacity-90 cursor-pointer"
                        title={t("status.kill_game_title")}
                      >
                        <Square className="w-3.5 h-3.5 fill-white" />
                        <span>{t("status.kill_game")}</span>
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    onClick={() => handleLaunch(selectedGame.id)}
                    className="flex items-center gap-2.5 px-6 py-3 rounded-xl font-black text-xs text-white shadow-xl transition-all hover:brightness-110 active:opacity-90"
                    style={{
                      backgroundColor: "var(--accent-primary)",
                      boxShadow: `0 0 25px var(--accent-glow)`,
                    }}
                  >
                    {selectedGame.is_installed ? (
                      <Play className="w-4 h-4 fill-white" />
                    ) : (
                      <Download className="w-4 h-4 text-white" />
                    )}
                    <span>
                      {selectedGame.is_installed
                        ? t("game_details.play_now")
                        : t("game_details.install_now")}
                    </span>
                  </button>
                )}

                <button
                  onClick={() => handleEnrichSingleGame(selectedGame.id)}
                  disabled={isEnrichingSingle}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.04] text-xs font-bold text-white transition-all backdrop-blur-md hover:bg-white/[0.08] hover:border-slate-400 active:opacity-90"
                  title={t("topbar.enrich_tooltip")}
                >
                  <Sparkles
                    className={`w-3.5 h-3.5 ${
                      isEnrichingSingle ? "animate-spin text-amber-400" : "text-amber-400"
                    }`}
                  />
                  <span>
                    {isEnrichingSingle ? t("game_details.enriching") : t("game_details.enrich_pipeline")}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setGameToEdit(selectedGame);
                    setShowEditorModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.04] text-xs font-bold text-white transition-all backdrop-blur-md hover:bg-white/[0.08] hover:border-indigo-400 active:opacity-90"
                  title={t("game_details.edit_manual")}
                >
                  <Pencil className="w-4 h-4 text-indigo-400" />
                  <span>{t("game_details.edit_manual")}</span>
                </button>

                <button
                  onClick={() => {
                    setGameToResolve(selectedGame);
                    setShowResolutionModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.04] text-xs font-bold text-white transition-all backdrop-blur-md hover:bg-white/[0.08] hover:border-slate-400 active:opacity-90"
                  title={t("game_details.identify_metadata")}
                >
                  <Search className="w-3.5 h-3.5 text-sky-400" />
                  <span>{t("game_details.identify_metadata")}</span>
                </button>

                {/* Manage Menu Button */}
                <button
                  ref={manageButtonRef}
                  type="button"
                  onClick={toggleManageMenu}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.04] text-xs font-bold text-white transition-all backdrop-blur-md hover:bg-white/[0.08] hover:border-slate-400 active:opacity-90 cursor-pointer"
                  title={t("game_details.manage")}
                >
                  <Settings2 className="w-4 h-4 text-slate-300" />
                  <span>{t("game_details.manage")}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showManageMenu ? "rotate-180" : ""}`} />
                </button>

                {/* Manage Menu Portal (renders into document.body to avoid parent overflow clipping) */}
                {showManageMenu &&
                  createPortal(
                    <>
                      <div
                        className="fixed inset-0 z-[9998]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowManageMenu(false);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setShowManageMenu(false);
                        }}
                      />
                      <div
                        className="fixed z-[9999] w-64 rounded-2xl border shadow-2xl backdrop-blur-xl py-1.5 select-none text-xs animate-in fade-in zoom-in-95 duration-150"
                        style={{
                          top: `${menuPosition.top}px`,
                          left: `${menuPosition.left}px`,
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-color)",
                          boxShadow: "0 16px 40px rgba(0,0,0,0.85)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {selectedGame.is_installed && handleOpenInstallDir && (
                          <button
                            onClick={() => {
                              setShowManageMenu(false);
                              handleOpenInstallDir(selectedGame.id);
                            }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left font-medium text-slate-200 hover:text-white hover:bg-white/5 transition-colors"
                          >
                            <FolderOpen className="w-4 h-4 text-amber-400" />
                            <span>{t("game_details.open_install_dir")}</span>
                          </button>
                        )}

                        {handleCreateShortcut && (
                          <button
                            onClick={() => {
                              setShowManageMenu(false);
                              handleCreateShortcut(selectedGame.id);
                            }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left font-medium text-slate-200 hover:text-white hover:bg-white/5 transition-colors"
                          >
                            <Monitor className="w-4 h-4 text-cyan-400" />
                            <span>{t("game_details.create_desktop_shortcut")}</span>
                          </button>
                        )}

                        {["steam", "epic"].includes(selectedGame.library.toLowerCase()) && handleVerifyFiles && (
                          <button
                            onClick={() => {
                              setShowManageMenu(false);
                              handleVerifyFiles(selectedGame.id);
                            }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left font-medium text-slate-200 hover:text-white hover:bg-white/5 transition-colors"
                          >
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            <span>{t("game_details.verify_files")}</span>
                          </button>
                        )}

                        <div className="my-1 border-t" style={{ borderColor: "var(--border-color)" }} />

                        {selectedGame.is_installed && handleOpenUninstallModal && (
                          <button
                            onClick={() => {
                              setShowManageMenu(false);
                              handleOpenUninstallModal(selectedGame);
                            }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left font-bold text-rose-400 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-rose-400" />
                            <span>{t("game_details.uninstall")}</span>
                          </button>
                        )}

                        {handleRemoveFromLibrary && (
                          <button
                            onClick={() => {
                              setShowManageMenu(false);
                              handleRemoveFromLibrary(selectedGame.id);
                            }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                          >
                            <XCircle className="w-4 h-4 text-slate-500" />
                            <span>{t("game_details.remove_from_library")}</span>
                          </button>
                        )}
                      </div>
                    </>,
                    document.body
                  )}
              </div>

              {/* Slot: Details Hero */}
              <Slot name="details.hero" gameId={selectedGame.id} />
            </div>
          </div>
        </section>

        {/* Information Cards & Metadata Tabs */}
        <div className="p-8 space-y-5">
          {/* HowLongToBeat call-to-action or refresh bar */}
          {!(selectedGame.extra_metadata && selectedGame.extra_metadata.includes("howlongtobeat")) ? (
            <div className="flex items-center justify-between p-3.5 px-4 rounded-xl border border-white/[0.06] bg-white/[0.02] text-xs transition-colors">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <span className="font-semibold text-white">{t("game_details.hltb_title")}</span>
                  <p className="text-[11px] text-slate-400">
                    {t("game_details.hltb_not_downloaded")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => (handleRefreshHltb ? handleRefreshHltb(selectedGame.id) : handleEnrichSingleGame(selectedGame.id))}
                disabled={isEnrichingSingle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:brightness-110 active:opacity-90 shadow-sm shrink-0"
                style={{ backgroundColor: "var(--accent-primary)" }}
              >
                <Sparkles className={`w-3.5 h-3.5 ${isEnrichingSingle ? "animate-spin" : ""}`} />
                <span>{isEnrichingSingle ? t("game_details.downloading") : t("game_details.download_source")}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 text-xs">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-semibold text-slate-300 text-xs">{t("game_details.hltb_title")}</span>
                </div>
                <button
                  onClick={() => (handleRefreshHltb ? handleRefreshHltb(selectedGame.id) : handleEnrichSingleGame(selectedGame.id))}
                  disabled={isEnrichingSingle}
                  title={t("game_details.refresh_hltb_title")}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isEnrichingSingle ? "animate-spin text-amber-400" : ""}`} />
                  <span>{isEnrichingSingle ? t("game_details.refreshing") : t("game_details.refresh_source")}</span>
                </button>
              </div>
              <Slot name="details.info" gameId={selectedGame.id} />
            </div>
          )}

          {/* Card 1: Synopsis & Description */}
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
            <span className="text-xs font-bold tracking-wider uppercase flex items-center gap-2 text-slate-400">
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t("game_details.description")}</span>
            </span>
            <p className="text-sm leading-relaxed text-slate-300">
              {selectedGame.description || t("game_details.no_description")}
            </p>
          </div>

          {/* Card 2: Technical Parameters - Unified Clean Grid */}
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("game_details.developers")}
                </span>
                <p className="text-xs font-bold text-white truncate">
                  {selectedGame.developers.join(", ") || "N/A"}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("game_details.publishers")}
                </span>
                <p className="text-xs font-bold text-white truncate">
                  {(selectedGame.publishers && selectedGame.publishers.join(", ")) || "N/A"}
                </p>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("game_details.genres")}
                </span>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {selectedGame.genres && selectedGame.genres.length > 0 ? (
                    selectedGame.genres.map((genre) => {
                      const active = isGenreActive(genre);
                      return (
                        <button
                          key={genre}
                          type="button"
                          onClick={() => handleFilterByGenre(genre)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                            active
                              ? "bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-xs shadow-indigo-500/20"
                              : "bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.06] hover:border-indigo-500/30 text-slate-200 hover:text-white"
                          }`}
                          title={`Filtra per genere: ${genre}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              active ? "bg-indigo-400" : "bg-slate-500"
                            }`}
                          />
                          <span>{genre}</span>
                        </button>
                      );
                    })
                  ) : (
                    <span className="text-xs font-bold text-slate-400">N/A</span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("game_details.release_date")}
                </span>
                <p className="text-xs font-bold text-white truncate">{selectedGame.release_date || "N/A"}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("game_details.playtime")}
                </span>
                <p className="text-xs font-bold text-emerald-400 truncate">
                  {selectedGame.playtime_formatted}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("groups.completion_status")}
                </span>
                <div className="pt-0.5">
                  {(() => {
                    const statusInfo = getCompletionStatusInfo(selectedGame.completion_status);
                    const isFiltered = isFilterActive
                      ? isFilterActive(`completion:${selectedGame.completion_status || "NotPlayed"}`)
                      : activeFilter === `completion:${selectedGame.completion_status || "NotPlayed"}`;
                    return (
                      <button
                        type="button"
                        onClick={() => handleFilterByCompletion(selectedGame.completion_status)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-semibold border flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                          isFiltered ? "ring-2 ring-indigo-400 " : ""
                        } ${statusInfo.bg} ${statusInfo.border} ${statusInfo.color}`}
                        title={`Filtra per stato: ${statusInfo.label}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                        <span>{statusInfo.label}</span>
                      </button>
                    );
                  })()}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("game_details.critic_score")}
                </span>
                <p className="text-xs font-bold text-amber-400 truncate">
                  {selectedGame.critic_score ? `★ ${selectedGame.critic_score}` : "N/A"}
                </p>
              </div>
            </div>
          </div>

          {/* Native Achievements Showcase */}
          <GameAchievementsGallery key={selectedGame.id} game={selectedGame} />

          {/* Card 3: Key Features (Playnite Parity) */}
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider uppercase flex items-center gap-2 text-slate-400">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t("game_details.features")}</span>
              </span>
              <button
                onClick={() => {
                  setGameToEdit(selectedGame);
                  setShowEditorModal(true);
                }}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
              >
                {t("common.edit")}
              </button>
            </div>
            {selectedGame.features && selectedGame.features.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {selectedGame.features.map((feature, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs font-medium text-slate-200 transition-colors flex items-center gap-2 shadow-xs"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/80 shrink-0" />
                    <span>{feature}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-slate-400">
                {t("game_details.no_features")}
              </p>
            )}
          </div>

          {/* Card 4: Custom Links */}
          {selectedGame.custom_links && selectedGame.custom_links.length > 0 && (
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
              <span className="text-xs font-bold tracking-wider uppercase flex items-center gap-2 text-slate-400">
                <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t("game_details.custom_links")}</span>
              </span>
              <div className="flex flex-wrap gap-2.5 pt-1">
                {selectedGame.custom_links.map((lnk, idx) => (
                  <a
                    key={idx}
                    href={lnk.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/[0.08] bg-white/[0.04] text-xs font-bold text-white transition-all hover:bg-white/[0.08] hover:border-indigo-400 active:opacity-90 shadow-sm"
                  >
                    <span>{lnk.title}</span>
                    <ExternalLink className="w-3 h-3 text-indigo-400" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
