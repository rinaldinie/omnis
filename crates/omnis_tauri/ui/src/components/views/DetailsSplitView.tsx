import React from "react";
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
} from "lucide-react";
import { ActiveGameSession, GameDto, ThemeConfig, ViewMode, formatImageUrl } from "../../types";
import { StoreBadge } from "../StoreBadge";
import { VideoBackdrop } from "../common/VideoBackdrop";
import { Slot } from "../common/Slot";
import { GameCardCover } from "../common/GameCardCover";

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
}: DetailsSplitViewProps) {
  const isSelectedGameRunning = activeGame?.game_id === selectedGame.id;
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Column: Titles Quick List (300px collapsible master panel) */}
      <div
        className={`border-r flex flex-col transition-all duration-300 select-none ${
          detailsSidebarOpen ? "w-80 min-w-[300px] max-w-[320px]" : "w-11 min-w-[44px] max-w-[44px]"
        }`}
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
        }}
      >
        {/* Master list header with search & collapse button */}
        <div
          className="p-2.5 border-b flex items-center justify-between gap-2"
          style={{ borderColor: "var(--border-color)" }}
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
                  placeholder="Filtra titoli..."
                  value={detailsSearchQuery}
                  onChange={(e) => setDetailsSearchQuery(e.target.value)}
                  className="w-full h-7 pl-8 pr-7 rounded-lg text-xs focus:outline-none border"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
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
                className="p-1.5 rounded-lg border hover:text-white transition-colors"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-muted)",
                }}
                title="Collassa elenco laterale"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setDetailsSidebarOpen(true)}
              className="w-full py-1.5 flex items-center justify-center rounded-lg border hover:text-white transition-colors"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
                color: "var(--text-muted)",
              }}
              title="Espandi elenco laterale"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Master list of games */}
        {detailsSidebarOpen && (
          <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: "var(--border-color)" }}>
            {detailsFilteredGames.map((game) => {
              const isSelected = selectedGame.id === game.id;
              const thumb = game.icon_image || game.cover_image;

              return (
                <div
                  key={game.id}
                  onClick={() => setSelectedGame(game)}
                  onContextMenu={(e) => handleOpenContextMenu(e, game)}
                  className={`p-2.5 flex items-center gap-3 cursor-pointer transition-all ${
                    isSelected ? "border-l-4" : "hover:bg-white/[0.04]"
                  }`}
                  style={{
                    backgroundColor: isSelected ? "var(--bg-card)" : "transparent",
                    borderLeftColor: isSelected ? "var(--accent-primary)" : "transparent",
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center border shrink-0 shadow-sm"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
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
                          In Esecuzione
                        </span>
                      ) : game.is_installed ? (
                        <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Installato
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
          className="px-8 py-3 border-b flex items-center justify-between shrink-0 z-20"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-color)",
          }}
        >
          <button
            onClick={() => setViewMode("grid")}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-black transition-all hover:bg-white/10 hover:border-slate-400 active:opacity-90 shadow-sm"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" style={{ color: "var(--accent-primary)" }} />
            <span>{t("game_details.back_to_grid")}</span>
          </button>

          <div
            className="flex items-center gap-2 text-xs font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            <span>Libreria</span>
            <span>/</span>
            <StoreBadge library={selectedGame.library} showName={true} />
            <span>/</span>
            <span className="text-white font-bold">{selectedGame.title}</span>
          </div>
        </div>

        {/* Hero Background Full-Width with Ambient Gradient / Video Trailer */}
        <section data-omnis="details.hero" className="relative h-88 min-h-[340px] w-full overflow-hidden flex items-end p-8">
          {currentTheme ? (
            <VideoBackdrop
              game={selectedGame}
              theme={currentTheme}
              blurLevel={currentTheme.enable_video_backdrop ? "none" : "subtle"}
              isPaused={isGameRunning}
            />
          ) : (
            <>
              {selectedGame.background_image ? (
                <img
                  key={selectedGame.background_image}
                  src={formatImageUrl(selectedGame.background_image)}
                  alt="Hero"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : selectedGame.cover_image ? (
                <img
                  key={selectedGame.cover_image}
                  src={formatImageUrl(selectedGame.cover_image)}
                  alt="Hero"
                  className="absolute inset-0 w-full h-full object-cover filter blur-md scale-110 opacity-40"
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
                  background: `linear-gradient(to top, var(--bg-base) 0%, rgba(9, 12, 20, 0.6) 60%, transparent 100%)`,
                }}
              />
            </>
          )}

          <div className="relative z-10 flex items-end gap-6 w-full">
            {/* 3D Boxart Cover with Border & Shadow */}
            <div className="w-40 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 flex-shrink-0 bg-black/60 [transform:translateZ(0)]">
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
              <div className="flex flex-wrap items-center gap-2">
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
                      ? "⏳ IN AVVIO..."
                      : activeGame?.state === "stopping"
                      ? "🛑 IN CHIUSURA..."
                      : `● IN ESECUZIONE (${formatDuration ? formatDuration(elapsedSeconds || 0) : `${elapsedSeconds || 0}s`})`}
                  </span>
                )}
                {selectedGame.is_installed ? (
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    INSTALLATO
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-medium bg-slate-800/60 text-slate-400 border border-slate-700/60">
                    DISPONIBILE
                  </span>
                )}
                {selectedGame.critic_score && (
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
                    ★ {selectedGame.critic_score}
                  </span>
                )}
                {selectedGame.series && (
                  <span
                    className="px-2.5 py-0.5 rounded text-[10px] font-bold border"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Serie: {selectedGame.series}
                  </span>
                )}
              </div>

              <h1 data-omnis="details.title" className="text-3xl md:text-4xl font-black text-white tracking-tight drop-shadow-md">
                {selectedGame.title}
              </h1>

              {/* Action Buttons Bar */}
              <div data-omnis="details.actions" className="flex flex-wrap items-center gap-3 pt-2">
                {isSelectedGameRunning ? (
                  <>
                    <button
                      disabled
                      className="flex items-center gap-2.5 px-6 py-3 rounded-xl font-black text-xs text-emerald-200 bg-emerald-600/30 border border-emerald-500/50 shadow-xl cursor-default"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>In Esecuzione... ({formatDuration ? formatDuration(elapsedSeconds || 0) : `${elapsedSeconds || 0}s`})</span>
                    </button>

                    {handleKillRunningGame && (
                      <button
                        type="button"
                        onClick={handleKillRunningGame}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 border border-rose-400/50 shadow-xl shadow-rose-950/40 transition-all hover:scale-105 active:opacity-90 cursor-pointer"
                        title="Termina forzatamente il processo del gioco"
                      >
                        <Square className="w-3.5 h-3.5 fill-white" />
                        <span>Termina Gioco</span>
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
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-bold text-white transition-all backdrop-blur-md hover:bg-white/15 hover:border-slate-400 active:opacity-90"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                  title="Scarica informazioni aggiuntive (tempi di gioco HowLongToBeat, voti della critica, copertine HD)"
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
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-bold text-white transition-all backdrop-blur-md hover:bg-white/15 hover:border-indigo-400 active:opacity-90 shadow-md"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--accent-primary)",
                  }}
                  title="Modifica manualmente tutti i metadati, immagini, percorsi e azioni di avvio"
                >
                  <Pencil className="w-4 h-4 text-indigo-400" />
                  <span>{t("game_details.edit_manual")}</span>
                </button>

                <button
                  onClick={() => {
                    setGameToResolve(selectedGame);
                    setShowResolutionModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-bold text-white transition-all backdrop-blur-md hover:bg-white/15 hover:border-slate-400 active:opacity-90"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                  title="Cerca e risolvi metadati da Steam, SteamGridDB o OpenCritic"
                >
                  <Search className="w-3.5 h-3.5 text-sky-400" />
                  <span>{t("game_details.identify_metadata")}</span>
                </button>
              </div>

              {/* Slot: Details Hero */}
              <Slot name="details.hero" gameId={selectedGame.id} />
            </div>
          </div>
        </section>

        {/* Information Cards & Metadata Tabs */}
        <div className="p-8 space-y-6">
          {/* HowLongToBeat call-to-action or refresh bar */}
          {!(selectedGame.extra_metadata && selectedGame.extra_metadata.includes("howlongtobeat")) ? (
            <div
              className="flex items-center justify-between p-3.5 px-4 rounded-xl border border-dashed text-xs transition-colors"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.02)",
                borderColor: "rgba(255, 255, 255, 0.15)",
              }}
            >
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <span className="font-semibold text-white">Tempi di gioco stimati (HowLongToBeat)</span>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Informazioni aggiuntive non ancora scaricate per questo titolo
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleEnrichSingleGame(selectedGame.id)}
                disabled={isEnrichingSingle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:brightness-125 active:opacity-90 shadow-sm shrink-0"
                style={{ backgroundColor: "var(--accent-primary)" }}
              >
                <Sparkles className={`w-3.5 h-3.5 ${isEnrichingSingle ? "animate-spin" : ""}`} />
                <span>{isEnrichingSingle ? "Scaricamento..." : "Scarica Ora"}</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-1 -mb-3 text-xs">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold text-white/90">Tempi HowLongToBeat</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEnrichSingleGame(selectedGame.id)}
                  disabled={isEnrichingSingle}
                  title="Ricarica i dati da HowLongToBeat se non sono corretti"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isEnrichingSingle ? "animate-spin text-amber-400" : ""}`} />
                  <span>{isEnrichingSingle ? "Aggiornamento..." : "Ricarica Dati"}</span>
                </button>
                <button
                  onClick={() => {
                    setGameToEdit(selectedGame);
                    setShowEditorModal(true);
                  }}
                  title="Modifica manualmente le ore di completamento"
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Modifica</span>
                </button>
              </div>
            </div>
          )}

          {/* Slot: Details Info */}
          <Slot name="details.info" gameId={selectedGame.id} />
          {/* Card 1: Synopsis & Description */}
          <div
            className="p-6 rounded-2xl border space-y-3 shadow-md"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          >
            <span
              className="text-xs font-black tracking-widest uppercase flex items-center gap-2"
              style={{ color: "var(--text-muted)" }}
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t("game_details.description")}</span>
            </span>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
              {selectedGame.description || t("game_details.no_description")}
            </p>
          </div>

          {/* Card 2: Technical Parameters Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div
              className="p-4 rounded-xl border space-y-1 shadow-sm"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                {t("game_details.series")}
              </span>
              <p className="text-xs font-black text-white truncate">{selectedGame.series || "N/A"}</p>
            </div>

            <div
              className="p-4 rounded-xl border space-y-1 shadow-sm"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                {t("game_details.developers")}
              </span>
              <p className="text-xs font-black text-white truncate">
                {selectedGame.developers.join(", ") || "N/A"}
              </p>
            </div>

            <div
              className="p-4 rounded-xl border space-y-1 shadow-sm"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                {t("game_details.genres")}
              </span>
              <p className="text-xs font-black text-white truncate">
                {selectedGame.genres.join(", ") || "N/A"}
              </p>
            </div>

            <div
              className="p-4 rounded-xl border space-y-1 shadow-sm"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                {t("game_details.release_date")}
              </span>
              <p className="text-xs font-black text-white truncate">{selectedGame.release_date || "N/A"}</p>
            </div>

            <div
              className="p-4 rounded-xl border space-y-1 shadow-sm"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                {t("game_details.playtime")}
              </span>
              <p className="text-xs font-black text-emerald-400 truncate">
                {selectedGame.playtime_formatted}
              </p>
            </div>

            <div
              className="p-4 rounded-xl border space-y-1 shadow-sm"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                {t("groups.completion_status")}
              </span>
              <p className="text-xs font-black text-indigo-400 truncate">
                {selectedGame.completion_status || t("game_details.not_played")}
              </p>
            </div>

            <div
              className="p-4 rounded-xl border space-y-1 shadow-sm"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                {t("game_details.critic_score")}
              </span>
              <p className="text-xs font-black text-amber-400 truncate">
                {selectedGame.critic_score ? `★ ${selectedGame.critic_score}` : "N/A"}
              </p>
            </div>

            <div
              className="p-4 rounded-xl border space-y-1 shadow-sm"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                {t("game_details.publishers")}
              </span>
              <p className="text-xs font-black text-white truncate">
                {(selectedGame.publishers && selectedGame.publishers.join(", ")) || "N/A"}
              </p>
            </div>
          </div>

          {/* Card 3: Player Notes */}
          <div
            className="p-6 rounded-2xl border space-y-3 shadow-md"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-black tracking-widest uppercase flex items-center gap-2"
                style={{ color: "var(--text-muted)" }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t("game_details.player_notes")}</span>
              </span>
              <button
                onClick={() => {
                  setGameToEdit(selectedGame);
                  setShowEditorModal(true);
                }}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {t("common.edit")}
              </button>
            </div>
            <p className="text-xs leading-relaxed whitespace-pre-wrap text-slate-300">
              {selectedGame.user_notes ||
                "Nessuna nota personale per questo gioco. Clicca su Modifica Scheda per aggiungere appunti, strategie o guide."}
            </p>
          </div>

          {/* Card 4: Custom Links */}
          {selectedGame.custom_links && selectedGame.custom_links.length > 0 && (
            <div
              className="p-6 rounded-2xl border space-y-3 shadow-md"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <span
                className="text-xs font-black tracking-widest uppercase flex items-center gap-2"
                style={{ color: "var(--text-muted)" }}
              >
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
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold text-white transition-all hover:bg-white/15 hover:border-indigo-400 active:opacity-90 shadow-sm"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                    }}
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
