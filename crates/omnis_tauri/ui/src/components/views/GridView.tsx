import React from "react";
import { Gamepad2, ChevronRight, ChevronDown, Play, Download, Info, Pencil } from "lucide-react";
import { GameDto, GroupBy, ViewMode } from "../../types";
import { StoreBadge } from "../StoreBadge";

interface GridViewProps {
  filteredGames: GameDto[];
  groupedGames: Record<string, GameDto[]>;
  groupBy: GroupBy;
  collapsedGroups: Record<string, boolean>;
  toggleGroup: (groupName: string) => void;
  gridCardWidth: number;
  selectedGame: GameDto;
  setSelectedGame: (game: GameDto) => void;
  setViewMode: (mode: ViewMode) => void;
  handleOpenContextMenu: (e: React.MouseEvent, game: GameDto) => void;
  handleLaunch: (gameId: string) => void;
  setGameToEdit: (game: any) => void;
  setShowEditorModal: (show: boolean) => void;
}

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
}: GridViewProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {filteredGames.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-center p-8">
          <Gamepad2 className="w-12 h-12 mb-3 opacity-30" style={{ color: "var(--text-muted)" }} />
          <span className="text-sm font-bold text-white">Nessun gioco trovato</span>
          <span className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Prova a modificare i filtri o la query di ricerca.
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
                    {isCollapsed ? "Espandi" : "Comprimi"}
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
                  {groupGames.map((game) => (
                    <div
                      key={game.id}
                      onClick={() => {
                        setSelectedGame(game);
                        setViewMode("details");
                      }}
                      onContextMenu={(e) => handleOpenContextMenu(e, game)}
                      className={`group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 transform hover:-translate-y-1 shadow-lg border ${
                        selectedGame.id === game.id ? "ring-2" : ""
                      }`}
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor:
                          selectedGame.id === game.id ? "var(--accent-primary)" : "var(--border-color)",
                        boxShadow:
                          selectedGame.id === game.id ? `0 0 20px var(--accent-glow)` : undefined,
                      }}
                    >
                      <div className="aspect-[2/3] w-full relative overflow-hidden bg-black/40">
                        {game.cover_image ? (
                          <img
                            src={game.cover_image}
                            alt={game.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center">
                            <span
                              className="w-12 h-12 rounded-xl font-black text-lg flex items-center justify-center mb-1.5 shadow-inner"
                              style={{
                                backgroundColor: "var(--accent-glow)",
                                color: "var(--accent-primary)",
                              }}
                            >
                              {game.title.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="text-[11px] font-bold text-white line-clamp-2 leading-tight">
                              {game.title}
                            </span>
                          </div>
                        )}

                        {/* Top Left: Store Badge & Status */}
                        <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10 pointer-events-none">
                          <StoreBadge library={game.library} />
                          {game.is_installed && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-md shadow-emerald-400/50" />
                          )}
                        </div>

                        {/* Top Right: Score Badge */}
                        {game.critic_score && (
                          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[9px] font-black text-amber-300 border border-white/10 z-10 shadow-sm pointer-events-none">
                            ★ {game.critic_score}
                          </div>
                        )}

                        {/* Transparent Minimalist Hover Action Dock */}
                        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-3 p-2 transition-all duration-300 backdrop-blur-[1.5px]">
                          {game.is_installed ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLaunch(game.id);
                              }}
                              className="w-9 h-9 rounded-full bg-emerald-500/30 hover:bg-emerald-500/60 text-white border border-emerald-400/40 backdrop-blur-md shadow-xl flex items-center justify-center transition-all hover:brightness-125 active:opacity-80"
                              title="Avvia Gioco"
                            >
                              <Play className="w-4 h-4 fill-white" />
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLaunch(game.id);
                              }}
                              className="w-9 h-9 rounded-full bg-indigo-500/40 hover:bg-indigo-500/70 text-white border border-indigo-400/50 backdrop-blur-md shadow-xl flex items-center justify-center transition-all hover:brightness-125 active:opacity-80"
                              title="Installa Gioco (Client Nativo)"
                            >
                              <Download className="w-4 h-4 text-white" />
                            </button>
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedGame(game);
                              setViewMode("details");
                            }}
                            className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/40 text-white border border-white/30 backdrop-blur-md shadow-xl flex items-center justify-center transition-all hover:brightness-125 active:opacity-80"
                            title="Mostra Dettagli"
                          >
                            <Info className="w-4 h-4" />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setGameToEdit(game);
                              setShowEditorModal(true);
                            }}
                            className="w-9 h-9 rounded-full bg-indigo-500/25 hover:bg-indigo-500/50 text-indigo-200 hover:text-white border border-indigo-400/40 backdrop-blur-md shadow-xl flex items-center justify-center transition-all hover:brightness-125 active:opacity-80"
                            title="Modifica Informazioni (Manuale)"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Bottom Info Bar */}
                      <div className="p-2.5 flex flex-col gap-0.5">
                        <span
                          className="font-bold text-xs text-white truncate leading-snug"
                          title={game.title}
                        >
                          {game.title}
                        </span>
                        <div
                          className="flex items-center justify-between text-[10px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <span className="truncate">{game.playtime_formatted}</span>
                          <span className="truncate max-w-[70px] text-right">
                            {game.genres[0] || "Gioco"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
