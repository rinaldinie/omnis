import React from "react";
import {
  ArrowLeft,
  Play,
  Download,
  Sparkles,
  Pencil,
  Search,
  Settings2,
  ChevronDown,
  Square,
  FolderOpen,
  Monitor,
  ShieldCheck,
  Trash2,
  XCircle,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActiveGameSession, GameDto, ThemeConfig, TranslateFn, ViewMode, formatImageUrl } from "../../../types";
import { useActiveGameTimer } from "../../../context/ActiveGameTimerContext";
import { StoreBadge } from "../../common/StoreBadge";
import { VideoBackdrop } from "../../common/VideoBackdrop";
import { Slot } from "../../common/Slot";
import { GameCardCover } from "../../common/GameCardCover";
import { getCompletionStatusInfo, getGenreFilterTarget, isGenreFilterActive } from "./helpers";
import { useTranslation } from "../../../i18n";
import { getLocalizedGenre, dedupeGenres } from "../../../utils/genres";

export interface DetailsHeroHeaderProps {
  currentTheme?: ThemeConfig;
  selectedGame: GameDto;
  setViewMode: (mode: ViewMode) => void;
  handleLaunch: (gameId: string) => void;
  handleEnrichSingleGame: (gameId: string) => void;
  isEnrichingSingle: boolean;
  setGameToEdit: (game: GameDto) => void;
  setShowEditorModal: (show: boolean) => void;
  setGameToResolve: (game: GameDto) => void;
  setShowResolutionModal: (show: boolean) => void;
  t: TranslateFn;
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
  handlePromoteCopy?: (copyId: string) => void;
  handleToggleFavorite?: (game: GameDto) => void;
}

export const DetailsHeroHeader: React.FC<DetailsHeroHeaderProps> = ({
  currentTheme,
  selectedGame,
  setViewMode,
  handleLaunch,
  handleEnrichSingleGame,
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
  handlePromoteCopy: _handlePromoteCopy,
  handleToggleFavorite,
}) => {
  const { locale } = useTranslation();
  const isSelectedGameRunning = activeGame?.game_id === selectedGame.id;
  const timerContextSeconds = useActiveGameTimer();
  const actualElapsed = elapsedSeconds ?? timerContextSeconds;

  const handleFilterByGenre = (genre: string) => {
    if (!setActiveFilter) return;
    setActiveFilter(getGenreFilterTarget(genre));
  };

  const isGenreActive = (genre: string) =>
    isGenreFilterActive(genre, activeFilter, isFilterActive);

  const handleFilterByCompletion = (status?: string | null) => {
    if (!setActiveFilter) return;
    const target = `completion:${status || "NotPlayed"}`;
    setActiveFilter(target);
  };

  return (
    <>
      {/* Top Bar with Back Button & Breadcrumbs */}
      <div
        className="px-6 md:px-8 py-2.5 border-b border-white/[0.06] flex items-center justify-between shrink-0 z-20 backdrop-blur-md"
        style={{
          backgroundColor: "var(--bg-surface)",
        }}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setViewMode("grid")}
          className="h-auto gap-2 px-3.5 py-1.5 rounded-xl border-white/[0.08] bg-white/[0.04] text-xs font-semibold text-slate-200 hover:bg-white/[0.08] hover:text-white hover:border-white/20 shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" style={{ color: "var(--accent-primary)" }} />
          <span>{t("game_details.back_to_grid")}</span>
        </Button>

        <div
          className="flex items-center gap-2 text-xs font-semibold"
          style={{ color: "var(--text-muted)" }}
        >
          <span>{t("game_details.breadcrumb_library")}</span>
          <span>/</span>
          <StoreBadge library={selectedGame.library} variant="subtle" />
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
          <div className="w-32 sm:w-36 md:w-40 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border border-white/20 flex-shrink-0 bg-black/60 [transform:translateZ(0)]">
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
              <StoreBadge library={selectedGame.library} variant="subtle" className="p-1.5" />
              {isSelectedGameRunning && (
                <span className={`px-3 py-1 rounded-full text-xs font-bold border shadow-sm flex items-center gap-1.5 ${
                  activeGame?.state === "launching"
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse"
                    : activeGame?.state === "stopping"
                    ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 animate-pulse"
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    activeGame?.state === "launching" ? "bg-amber-400" : activeGame?.state === "stopping" ? "bg-rose-400" : "bg-emerald-400 animate-ping"
                  }`} />
                  {activeGame?.state === "launching"
                    ? `⏳ ${t("status.launching")}`
                    : activeGame?.state === "stopping"
                    ? `🛑 ${t("status.stopping")}`
                    : `● ${t("status.running")} (${formatDuration ? formatDuration(actualElapsed) : `${actualElapsed}s`})`}
                </span>
              )}
              {selectedGame.is_installed && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 shadow-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {t("status.installed")}
                </span>
              )}
              {selectedGame.critic_score && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 shadow-xs">
                  ★ {selectedGame.critic_score}
                </span>
              )}
              {/* Completion Status Badge */}
              {(() => {
                const statusInfo = getCompletionStatusInfo(selectedGame.completion_status, t);
                const isFiltered = isFilterActive
                  ? isFilterActive(`completion:${selectedGame.completion_status || "NotPlayed"}`)
                  : activeFilter === `completion:${selectedGame.completion_status || "NotPlayed"}`;
                return (
                  <ActionTooltip label={t("tooltips.filter_status", { status: statusInfo.label })}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => handleFilterByCompletion(selectedGame.completion_status)}
                      className={`h-auto px-2.5 py-0.5 rounded-full text-[10px] font-semibold border shadow-xs flex items-center gap-1.5 active:scale-95 ${
                        isFiltered
                          ? "ring-1 ring-[var(--accent-primary)] " + statusInfo.bg + " " + statusInfo.border + " " + statusInfo.color
                          : statusInfo.bg + " " + statusInfo.border + " " + statusInfo.color
                      }`}
                      aria-label={t("tooltips.filter_status", { status: statusInfo.label })}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                      <span>{statusInfo.label}</span>
                    </Button>
                  </ActionTooltip>
                );
              })()}
              {selectedGame.series && (
                <span
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold border border-white/[0.08] bg-white/[0.04] text-slate-300"
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
                {dedupeGenres(selectedGame.genres).map((genre) => {
                  const active = isGenreActive(genre);
                  const localizedGenre = getLocalizedGenre(genre, locale);
                  return (
                    <ActionTooltip key={genre} label={t("tooltips.filter_genre", { genre: localizedGenre })}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => handleFilterByGenre(genre)}
                        className={`h-auto px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 active:scale-95 ${
                          active
                            ? "bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 border-[var(--accent-primary)] text-white shadow-xs"
                            : "bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border-white/[0.08] hover:border-white/20"
                        }`}
                        aria-label={t("tooltips.filter_genre", { genre: localizedGenre })}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white" : "bg-slate-400"}`} />
                        <span>{localizedGenre}</span>
                      </Button>
                    </ActionTooltip>
                  );
                })}
              </div>
            )}



            {/* Action Buttons Bar */}
            <div data-omnis="details.actions" className="flex flex-wrap items-center gap-2 sm:gap-2.5 pt-2">
              {isSelectedGameRunning ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled
                    className="h-auto gap-2.5 px-6 py-3 rounded-xl font-bold text-xs text-emerald-200 bg-emerald-600/30 border-emerald-500/50 shadow-lg disabled:opacity-100 cursor-default"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>{t("status.running")}... ({formatDuration ? formatDuration(actualElapsed) : `${actualElapsed}s`})</span>
                  </Button>

                  {handleKillRunningGame && (
                    <ActionTooltip label={t("status.kill_game_title")}>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={handleKillRunningGame}
                        className="h-auto gap-2 px-5 py-3 rounded-xl font-bold text-xs border-rose-500/50 shadow-lg hover:scale-105"
                        aria-label={t("status.kill_game_title")}
                      >
                        <Square className="w-3.5 h-3.5 fill-white" />
                        <span>{t("status.kill_game")}</span>
                      </Button>
                    </ActionTooltip>
                  )}
                </>
              ) : (
                <Button
                  type="button"
                  onClick={() => handleLaunch(selectedGame.id)}
                  className="h-auto gap-2.5 px-6 py-3 rounded-xl font-bold text-xs text-white shadow-lg hover:brightness-110 active:scale-95 bg-[var(--accent-primary)]"
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
                </Button>
              )}

              {handleToggleFavorite && (
                <ActionTooltip
                  label={
                    selectedGame.is_favorite
                      ? (t("sidebar.remove_favorite") || "Rimuovi dai preferiti")
                      : (t("sidebar.add_favorite") || "Aggiungi ai preferiti")
                  }
                >
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleToggleFavorite(selectedGame)}
                    className={`h-auto gap-2 px-4 py-3 rounded-xl text-xs font-semibold backdrop-blur-md active:scale-95 ${
                      selectedGame.is_favorite
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25 hover:text-amber-200"
                        : "bg-white/[0.04] border-white/[0.08] text-slate-200 hover:bg-white/[0.08] hover:border-white/20 hover:text-white"
                    }`}
                    aria-label={
                      selectedGame.is_favorite
                        ? (t("sidebar.remove_favorite") || "Rimuovi dai preferiti")
                        : (t("sidebar.add_favorite") || "Aggiungi ai preferiti")
                    }
                  >
                    <Star
                      className={`w-4 h-4 ${
                        selectedGame.is_favorite
                          ? "text-amber-400 fill-amber-400"
                          : "text-slate-300"
                      }`}
                    />
                    <span>
                      {selectedGame.is_favorite
                        ? t("sidebar.favorites")
                        : (t("sidebar.add_favorite") || "Preferito")}
                    </span>
                  </Button>
                </ActionTooltip>
              )}

              <ActionTooltip label={t("topbar.enrich_tooltip")}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleEnrichSingleGame(selectedGame.id)}
                  disabled={isEnrichingSingle}
                  className="h-auto gap-2 px-4 py-3 rounded-xl border-white/[0.08] bg-white/[0.04] text-xs font-semibold text-slate-200 backdrop-blur-md hover:bg-white/[0.08] hover:border-white/20 hover:text-white active:scale-95"
                  aria-label={t("topbar.enrich_tooltip")}
                >
                  <Sparkles
                    className={`w-3.5 h-3.5 ${
                      isEnrichingSingle ? "animate-spin text-amber-400" : "text-amber-400"
                    }`}
                  />
                  <span>
                    {isEnrichingSingle ? t("game_details.enriching") : t("game_details.enrich_pipeline")}
                  </span>
                </Button>
              </ActionTooltip>

              <ActionTooltip label={t("game_details.edit_manual")}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setGameToEdit(selectedGame);
                    setShowEditorModal(true);
                  }}
                  className="h-auto gap-2 px-4 py-3 rounded-xl border-white/[0.08] bg-white/[0.04] text-xs font-semibold text-slate-200 backdrop-blur-md hover:bg-white/[0.08] hover:border-white/20 hover:text-white active:scale-95"
                  aria-label={t("game_details.edit_manual")}
                >
                  <Pencil className="w-4 h-4 text-slate-300" />
                  <span>{t("game_details.edit_manual")}</span>
                </Button>
              </ActionTooltip>

              <ActionTooltip label={t("game_details.identify_metadata")}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setGameToResolve(selectedGame);
                    setShowResolutionModal(true);
                  }}
                  className="h-auto gap-2 px-4 py-3 rounded-xl border-white/[0.08] bg-white/[0.04] text-xs font-semibold text-slate-200 backdrop-blur-md hover:bg-white/[0.08] hover:border-white/20 hover:text-white active:scale-95"
                  aria-label={t("game_details.identify_metadata")}
                >
                  <Search className="w-3.5 h-3.5 text-slate-300" />
                  <span>{t("game_details.identify_metadata")}</span>
                </Button>
              </ActionTooltip>

              {/* Manage Dropdown Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto gap-2 px-4 py-3 rounded-xl border-white/[0.08] bg-white/[0.04] text-xs font-semibold text-slate-200 backdrop-blur-md hover:bg-white/[0.08] hover:border-white/20 hover:text-white active:scale-95 group"
                    aria-label={t("game_details.manage")}
                  >
                    <Settings2 className="w-4 h-4 text-slate-300" />
                    <span>{t("game_details.manage")}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="z-[9999] w-64 rounded-2xl py-1.5 shadow-2xl"
                >
                  {selectedGame.is_installed && handleOpenInstallDir && (
                    <DropdownMenuItem
                      onSelect={() => handleOpenInstallDir(selectedGame.id)}
                      className="justify-start gap-2.5 px-3.5 py-2.5 font-medium"
                    >
                      <FolderOpen className="w-4 h-4 text-amber-400" />
                      <span>{t("game_details.open_install_dir")}</span>
                    </DropdownMenuItem>
                  )}

                  {handleCreateShortcut && (
                    <DropdownMenuItem
                      onSelect={() => handleCreateShortcut(selectedGame.id)}
                      className="justify-start gap-2.5 px-3.5 py-2.5 font-medium"
                    >
                      <Monitor className="w-4 h-4 text-cyan-400" />
                      <span>{t("game_details.create_desktop_shortcut")}</span>
                    </DropdownMenuItem>
                  )}

                  {["steam", "epic"].includes((selectedGame.library || "").toLowerCase()) && handleVerifyFiles && (
                    <DropdownMenuItem
                      onSelect={() => handleVerifyFiles(selectedGame.id)}
                      className="justify-start gap-2.5 px-3.5 py-2.5 font-medium"
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>{t("game_details.verify_files")}</span>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  {selectedGame.is_installed && handleOpenUninstallModal && (
                    <DropdownMenuItem
                      onSelect={() => handleOpenUninstallModal(selectedGame)}
                      className="justify-start gap-2.5 px-3.5 py-2.5 font-bold text-rose-400 focus:bg-rose-500/10 focus:text-rose-300 data-[highlighted]:bg-rose-500/10 data-[highlighted]:text-rose-300"
                    >
                      <Trash2 className="w-4 h-4 text-rose-400" />
                      <span>{t("game_details.uninstall")}</span>
                    </DropdownMenuItem>
                  )}

                  {handleRemoveFromLibrary && (
                    <DropdownMenuItem
                      onSelect={() => handleRemoveFromLibrary(selectedGame.id)}
                      className="justify-start gap-2.5 px-3.5 py-2.5 font-medium text-slate-400 focus:bg-rose-500/10 focus:text-rose-300 data-[highlighted]:bg-rose-500/10 data-[highlighted]:text-rose-300"
                    >
                      <XCircle className="w-4 h-4 text-slate-500" />
                      <span>{t("game_details.remove_from_library")}</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Slot: Details Hero */}
            <Slot name="details.hero" gameId={selectedGame.id} />
          </div>
        </div>
      </section>
    </>
  );
};
