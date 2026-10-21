import React from "react";
import { Gamepad2, ChevronRight, ChevronDown, Play, Download, Info, Pencil, Square } from "lucide-react";
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
  onEdit: () => void;
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
        onClick={onSelect}
        onContextMenu={onContextMenu}
        className={`group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 transform-gpu hover:-translate-y-1 shadow-lg border will-change-transform [backface-visibility:hidden] [transform:translateZ(0)] ${
          isSelected ? "ring-2" : ""
        }`}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: isRunning
            ? "#10b981"
            : isSelected
            ? "var(--accent-primary)"
            : "var(--border-color)",
          boxShadow: isRunning
            ? `0 0 25px rgba(16, 185, 129, 0.4)`
            : isSelected
            ? `0 0 20px var(--accent-glow)`
            : undefined,
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
            <StoreBadge library={game.library} />
            {isRunning ? (
              <div
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold shadow-lg ${
                  activeGameState === "launching"
                    ? "bg-amber-500/20 border-amber-500/60 text-amber-300 animate-pulse shadow-amber-950/60"
                    : activeGameState === "stopping"
                    ? "bg-rose-500/20 border-rose-500/60 text-rose-300 shadow-rose-950/60"
                    : "bg-emerald-500/20 border-emerald-500/60 text-emerald-300 animate-pulse shadow-emerald-950/60"
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
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-md shadow-emerald-400/50" />
              )
            )}
          </div>

          {/* Top Right: Score Badge */}
          {game.critic_score && (
            <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/75 text-[9px] font-black text-amber-300 border border-white/10 z-10 shadow-sm pointer-events-none">
              ★ {game.critic_score}
            </div>
          )}

          {/* Transparent Minimalist Hover Action Dock */}
          <div className="absolute inset-0 bg-slate-950/75 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto flex items-center justify-center gap-2.5 p-2 transition-opacity duration-200 z-20">
            {isRunning ? (
              <>
                <button
                  disabled
                  className="w-9 h-9 rounded-full bg-emerald-500/40 text-emerald-300 border border-emerald-400/60 shadow-xl flex items-center justify-center cursor-default animate-pulse"
                  title={t("status.running")}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-ping" />
                </button>

                {onKill && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onKill();
                    }}
                    className="w-9 h-9 rounded-full bg-rose-600/90 hover:bg-rose-600 text-white border border-rose-400 shadow-xl shadow-rose-950/50 flex items-center justify-center transition-all hover:scale-110 active:opacity-80"
                    title={t("status.kill_game_title")}
                  >
                    <Square className="w-3.5 h-3.5 fill-white" />
                  </button>
                )}
              </>
            ) : game.is_installed ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLaunch();
                }}
                className="w-9 h-9 rounded-full bg-emerald-500/40 hover:bg-emerald-500/70 text-white border border-emerald-400/50 shadow-xl flex items-center justify-center transition-all hover:brightness-125 active:opacity-80"
                title={t("common.play")}
              >
                <Play className="w-4 h-4 fill-white" />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLaunch();
                }}
                className="w-9 h-9 rounded-full bg-indigo-500/40 hover:bg-indigo-500/70 text-white border border-indigo-400/50 shadow-xl flex items-center justify-center transition-all hover:brightness-125 active:opacity-80"
                title={t("common.install")}
              >
                <Download className="w-4 h-4 text-white" />
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/40 text-white border border-white/30 shadow-xl flex items-center justify-center transition-all hover:brightness-125 active:opacity-80"
              title={t("common.details")}
            >
              <Info className="w-4 h-4" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="w-9 h-9 rounded-full bg-indigo-500/25 hover:bg-indigo-500/50 text-indigo-200 hover:text-white border border-indigo-400/40 shadow-xl flex items-center justify-center transition-all hover:brightness-125 active:opacity-80"
              title={t("game_details.edit_manual")}
            >
              <Pencil className="w-4 h-4" />
            </button>
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
                  className="w-full flex items-center justify-between py-2 px-3.5 rounded-xl border transition-all text-left group"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
                    )}
                    <span className="text-xs font-black uppercase tracking-wider text-white">
                      {groupName}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold"
                      style={{
                        backgroundColor: "var(--accent-glow)",
                        color: "var(--accent-primary)",
                      }}
                    >
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
