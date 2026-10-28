import React from "react";
import { Gamepad2, ChevronRight, ChevronDown, Play, Download, Square, MoreHorizontal } from "lucide-react";
import { ActiveGameSession, GameDto, GroupBy, ViewMode } from "../../types";
import { StoreBadge } from "../StoreBadge";
import { Slot } from "../common/Slot";
import { GameCardCover } from "../common/GameCardCover";
import { useTranslation } from "../../i18n";

interface GridViewProps {
  filteredGames: GameDto[];
  groupedGames: Record<string, GameDto[]>;
  groupBy: GroupBy;
  collapsedGroups: Record<string, boolean>;
  toggleGroup: (groupName: string) => void;
  gridCardWidth: number;
  selectedGame: GameDto | null;
  setSelectedGame: (game: GameDto) => void;
  setViewMode: (mode: ViewMode) => void;
  handleOpenContextMenu: (e: React.MouseEvent, game: GameDto) => void;
  handleLaunch: (gameId: string) => void;
  setGameToEdit: (game: any) => void;
  setShowEditorModal: (show: boolean) => void;
  activeGame?: ActiveGameSession | null;
  elapsedSeconds?: number;
  formatDuration?: (seconds: number) => string;
  handleKillRunningGame?: () => void;
}

interface GameCardItemProps {
  game: GameDto;
  isSelected: boolean;
  isRunning: boolean;
  activeGameState?: "launching" | "running" | "stopping";
  elapsedSeconds?: number;
  formatDuration?: (seconds: number) => string;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onLaunch: () => void;
  onKill?: () => void;
  onEdit?: () => void;
}

const GameCardItem = React.memo(
  function GameCardItem({
    game,
    isSelected,
    isRunning,
    activeGameState,
    elapsedSeconds,
    formatDuration,
    onSelect,
    onContextMenu,
    onLaunch,
    onKill,
    onEdit,
  }: GameCardItemProps) {
    const { t } = useTranslation();
    return (
      <article
        data-omnis="game-card"
        data-state={isRunning ? "running" : game.is_installed ? "installed" : "missing"}
        role="button"
        tabIndex={0}
        aria-label={game.title}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        onContextMenu={onContextMenu}
        className={`group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 transform-gpu hover:-translate-y-1 shadow-md border will-change-transform [backface-visibility:hidden] [transform:translateZ(0)] ${
          isSelected
            ? "border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/40 shadow-lg"
            : isRunning
            ? "border-emerald-500/60 ring-1 ring-emerald-500/30 shadow-lg"
            : "border-[var(--border-color)] hover:border-white/20"
        }`}
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: "auto 180px auto 340px",
          backgroundColor: "var(--bg-card)",
        }}
      >
        <div className="aspect-[2/3] w-full relative overflow-hidden bg-black/40 [transform:translateZ(0)]">
          <GameCardCover
            coverImage={game.cover_image}
            backgroundImage={game.background_image}
            title={game.title}
          />

          {/* Top Left: Store Badge & Status */}
          <div data-omnis="game-card.badge" className="absolute top-2 left-2 flex items-center gap-1.5 z-10 pointer-events-none">
            <StoreBadge library={game.library} variant="subtle" />
            {isRunning ? (
              <div
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold shadow-sm backdrop-blur-sm ${
                  activeGameState === "launching"
                    ? "bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse"
                    : activeGameState === "stopping"
                    ? "bg-rose-500/20 border-rose-500/50 text-rose-300"
                    : "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 animate-pulse"
                }`}
              >
                <span>
                  {activeGameState === "launching"
                    ? `⏳ ${t("status.launching")}`
                    : activeGameState === "stopping"
                    ? `🛑 ${t("status.stopping")}`
                    : `● ${t("status.running")} (${formatDuration ? formatDuration(elapsedSeconds || 0) : `${elapsedSeconds || 0}s`})`}
                </span>
              </div>
            ) : (
              game.is_installed && (
                <span className="w-2 h-2 rounded-full bg-emerald-400/90 shadow-sm" />
              )
            )}
          </div>

          {/* Top Right: Score Badge */}
          {game.critic_score && (
            <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[9px] font-bold text-amber-300 border border-white/10 z-10 shadow-sm pointer-events-none">
              ★ {game.critic_score}
            </div>
          )}

          {/* Centered Hover Action Overlay */}
          <div
            onKeyDown={(e) => e.stopPropagation()}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto flex items-center justify-center gap-2 p-3 transition-opacity duration-200 z-20"
          >
            {isRunning ? (
              <>
                {onKill && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onKill();
                    }}
                    className="bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold rounded-xl px-4 py-2 shadow-lg flex items-center gap-2 text-xs transition-all cursor-pointer"
                    title={t("status.kill_game_title")}
                  >
                    <Square className="w-3.5 h-3.5 fill-white" />
                    <span>{t("status.kill_game")}</span>
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onContextMenu(e);
                  }}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-colors cursor-pointer"
                  title={t("game_details.manage")}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onLaunch();
                  }}
                  className="bg-[var(--accent-primary)] hover:brightness-110 active:scale-95 text-white font-bold rounded-xl px-4 py-2 shadow-lg flex items-center gap-2 text-xs transition-all cursor-pointer"
                  title={game.is_installed ? t("common.play") : t("common.install")}
                >
                  {game.is_installed ? (
                    <Play className="w-3.5 h-3.5 fill-white" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-white" />
                  )}
                  <span>{game.is_installed ? t("common.play") : t("common.install")}</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onContextMenu(e);
                  }}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-colors cursor-pointer"
                  title={t("game_details.manage")}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Bottom Info Bar */}
        <div className="p-2.5 flex flex-col gap-0.5">
          <h3
            data-omnis="game-card.title"
            className="font-bold text-xs text-white truncate leading-snug"
            title={game.title}
          >
            {game.title}
          </h3>
          <div
            className="flex items-center justify-between text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            <span className="truncate">{game.playtime_formatted}</span>
            <span className="truncate max-w-[70px] text-right">
              {game.genres[0] || "Gioco"}
            </span>
          </div>
          <Slot name="game-card.badges" gameId={game.id} />
        </div>
      </article>
    );
  },
  (prev, next) => {
    if (prev.game !== next.game) return false;
    if (prev.isSelected !== next.isSelected) return false;
    if (prev.isRunning !== next.isRunning) return false;
    if (prev.activeGameState !== next.activeGameState) return false;
    if (next.isRunning && prev.elapsedSeconds !== next.elapsedSeconds) return false;
    return true;
  }
);

export default function GridView({
  filteredGames,
  groupedGames,
  groupBy,
  collapsedGroups,
  toggleGroup,
  gridCardWidth,
  selectedGame,
  setSelectedGame,
  setViewMode,
  handleOpenContextMenu,
  handleLaunch,
  setGameToEdit,
  setShowEditorModal,
  activeGame,
  elapsedSeconds,
  formatDuration,
  handleKillRunningGame,
}: GridViewProps) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {filteredGames.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-center p-8">
          <Gamepad2 className="w-12 h-12 mb-3 opacity-30" style={{ color: "var(--text-muted)" }} />
          <span className="text-sm font-bold text-white">{t("views.no_games_found")}</span>
          <span className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {t("views.no_games_found_hint")}
          </span>
        </div>
      ) : (
        Object.entries(groupedGames).map(([groupName, groupGames]) => {
          const isCollapsed = !!collapsedGroups[groupName];
          const isGrouped = groupBy !== "none";

          return (
            <div key={groupName} className="space-y-3">
              {isGrouped && (
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="w-full flex items-center justify-between py-2 px-3.5 rounded-xl border border-[var(--border-color)] hover:border-white/20 transition-all text-left group bg-[var(--bg-card)]"
                >
                  <div className="flex items-center gap-2.5">
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-colors" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-colors" />
                    )}
                    <span className="text-xs font-bold uppercase tracking-wider text-white">
                      {groupName}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/[0.06] border border-white/[0.08] text-[var(--accent-primary)]">
                      {groupGames.length}
                    </span>
                  </div>
                  <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
                    {isCollapsed ? t("views.expand") : t("views.collapse")}
                  </span>
                </button>
              )}

              {!isCollapsed && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(auto-fill, minmax(${gridCardWidth}px, 1fr))`,
                    gap: "1.25rem",
                  }}
                >
                  {groupGames.map((game) => {
                    const isRunning = activeGame?.game_id === game.id;

                    return (
                      <GameCardItem
                        key={game.id}
                        game={game}
                        isSelected={selectedGame?.id === game.id}
                        isRunning={isRunning}
                        activeGameState={isRunning ? activeGame?.state : undefined}
                        elapsedSeconds={isRunning ? elapsedSeconds : undefined}
                        formatDuration={formatDuration}
                        onSelect={() => {
                          setSelectedGame(game);
                          setViewMode("details");
                        }}
                        onContextMenu={(e) => handleOpenContextMenu(e, game)}
                        onLaunch={() => handleLaunch(game.id)}
                        onKill={handleKillRunningGame}
                        onEdit={() => {
                          setGameToEdit(game);
                          setShowEditorModal(true);
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
