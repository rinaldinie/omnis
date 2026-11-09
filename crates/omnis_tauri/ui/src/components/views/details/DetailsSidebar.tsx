import React from "react";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { GameDto, ActiveGameSession } from "../../../types";
import { StoreBadge } from "../../StoreBadge";

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

export interface DetailsSidebarProps {
  detailsSidebarOpen: boolean;
  setDetailsSidebarOpen: (open: boolean) => void;
  detailsSearchQuery: string;
  setDetailsSearchQuery: (query: string) => void;
  detailsFilteredGames: GameDto[];
  selectedGame: GameDto;
  setSelectedGame: (game: GameDto) => void;
  handleOpenContextMenu: (e: React.MouseEvent, game: GameDto) => void;
  activeGame?: ActiveGameSession | null;
  activeFilter?: string;
  setActiveFilter?: (filter: string) => void;
  isFilterActive?: (filterId: string) => boolean;
  t: (key: string, params?: Record<string, any>) => string;
}

export const DetailsSidebar: React.FC<DetailsSidebarProps> = ({
  detailsSidebarOpen,
  setDetailsSidebarOpen,
  detailsSearchQuery,
  setDetailsSearchQuery,
  detailsFilteredGames,
  selectedGame,
  setSelectedGame,
  handleOpenContextMenu,
  activeGame,
  activeFilter,
  setActiveFilter,
  isFilterActive,
  t,
}) => {
  return (
    <div
      className={`border-r border-white/[0.06] flex flex-col transition-all duration-300 select-none ${
        detailsSidebarOpen ? "w-80 min-w-[300px] max-w-[320px]" : "w-11 min-w-[44px] max-w-[44px]"
      }`}
      style={{
        backgroundColor: "var(--bg-surface)",
      }}
    >
      {/* Master list header with search & collapse button */}
      <div className="p-2.5 border-b border-white/[0.06] flex items-center justify-between gap-2">
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
        <div className="px-3 py-1.5 border-b border-white/[0.06] bg-white/[0.03] flex items-center justify-between text-[11px] text-slate-300">
          <span className="truncate font-medium">
            Filtro: {activeFilter ? (activeFilter.startsWith("genre:") ? activeFilter.slice(6) : activeFilter.startsWith("completion:") ? activeFilter.slice(11) : activeFilter) : "Attivo"}
          </span>
          <button
            onClick={() => setActiveFilter && setActiveFilter("all")}
            className="p-0.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title={t("tooltips.reset_filters")}
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
                role="button"
                tabIndex={0}
                aria-selected={isSelected}
                onClick={() => setSelectedGame(game)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedGame(game);
                  }
                }}
                onContextMenu={(e) => handleOpenContextMenu(e, game)}
                className={`p-2.5 flex items-center gap-3 cursor-pointer transition-all ${
                  isSelected
                    ? "bg-white/[0.04] text-white border-l-2 border-[var(--accent-primary)] shadow-xs"
                    : "hover:bg-white/[0.02] text-slate-400 hover:text-slate-200 border-l-2 border-transparent"
                }`}
                style={{
                  contentVisibility: "auto",
                  containIntrinsicSize: "0 54px",
                }}
              >
                <div
                  className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center border border-white/[0.06] shrink-0 shadow-xs bg-black/40"
                >
                  <ListThumbCover thumb={thumb} title={game.title} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className={`text-xs font-bold truncate min-w-0 ${
                        isSelected ? "text-white" : "text-slate-300"
                      }`}
                      title={game.title}
                    >
                      {game.title}
                    </span>
                    <StoreBadge library={game.library} variant="subtle" className="py-0 px-1 text-[9px] shrink-0" />
                  </div>
                  {(activeGame?.game_id === game.id || game.is_installed) && (
                    <div className="flex items-center gap-2 mt-0.5">
                      {activeGame?.game_id === game.id ? (
                        <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-300 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                          {t("status.running")}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          {t("groups.installed")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
