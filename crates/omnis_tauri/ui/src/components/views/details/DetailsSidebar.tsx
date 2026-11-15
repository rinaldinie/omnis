import React from "react";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { GameDto, ActiveGameSession, TranslateFn } from "../../../types";
import { StoreBadge } from "../../common/StoreBadge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { ScrollArea } from "../../ui/scroll-area";
import { ActionTooltip } from "../../ui/tooltip";

export const DETAILS_SIDEBAR_WIDTH_STORAGE_KEY = "omnis_details_sidebar_width";
export const DEFAULT_DETAILS_SIDEBAR_WIDTH = 320;
export const MIN_DETAILS_SIDEBAR_WIDTH = 260;
export const MAX_DETAILS_SIDEBAR_WIDTH = 480;
const COLLAPSED_DETAILS_SIDEBAR_WIDTH = 44;
const RESIZE_KEYBOARD_STEP = 16;

function clampSidebarWidth(width: number): number {
  return Math.min(MAX_DETAILS_SIDEBAR_WIDTH, Math.max(MIN_DETAILS_SIDEBAR_WIDTH, Math.round(width)));
}

function readStoredSidebarWidth(): number {
  if (typeof localStorage === "undefined") {
    return DEFAULT_DETAILS_SIDEBAR_WIDTH;
  }
  try {
    const raw = localStorage.getItem(DETAILS_SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) return DEFAULT_DETAILS_SIDEBAR_WIDTH;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0
      ? clampSidebarWidth(parsed)
      : DEFAULT_DETAILS_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_DETAILS_SIDEBAR_WIDTH;
  }
}

function persistSidebarWidth(width: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DETAILS_SIDEBAR_WIDTH_STORAGE_KEY, String(clampSidebarWidth(width)));
  } catch {
    // Ignore storage quota or privacy-mode failures
  }
}

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
  t: TranslateFn;
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
  const selectedItemRef = React.useRef<HTMLDivElement | null>(null);
  const hasScrolledInitialRef = React.useRef(false);
  const [sidebarWidth, setSidebarWidth] = React.useState<number>(readStoredSidebarWidth);
  const [isResizing, setIsResizing] = React.useState(false);
  const latestWidthRef = React.useRef(sidebarWidth);
  const dragCleanupRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    latestWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  React.useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !detailsSidebarOpen) return;
    e.preventDefault();
    dragCleanupRef.current?.();

    const startX = e.clientX;
    const startWidth = latestWidthRef.current;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;

    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = clampSidebarWidth(startWidth + (moveEvent.clientX - startX));
      latestWidthRef.current = nextWidth;
      setSidebarWidth(nextWidth);
    };

    const cleanup = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      setIsResizing(false);
      dragCleanupRef.current = null;
    };

    const handleMouseUp = () => {
      persistSidebarWidth(latestWidthRef.current);
      cleanup();
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleResetWidth = () => {
    latestWidthRef.current = DEFAULT_DETAILS_SIDEBAR_WIDTH;
    setSidebarWidth(DEFAULT_DETAILS_SIDEBAR_WIDTH);
    persistSidebarWidth(DEFAULT_DETAILS_SIDEBAR_WIDTH);
  };

  const handleResizeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!detailsSidebarOpen) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? RESIZE_KEYBOARD_STEP : -RESIZE_KEYBOARD_STEP;
      const nextWidth = clampSidebarWidth(latestWidthRef.current + delta);
      latestWidthRef.current = nextWidth;
      setSidebarWidth(nextWidth);
      persistSidebarWidth(nextWidth);
    } else if (e.key === "Home") {
      e.preventDefault();
      handleResetWidth();
    }
  };

  React.useEffect(() => {
    if (!detailsSidebarOpen) {
      hasScrolledInitialRef.current = false;
      return;
    }
    const el = selectedItemRef.current;
    if (!el || typeof el.scrollIntoView !== "function") return;
    const block: ScrollLogicalPosition = hasScrolledInitialRef.current
      ? "nearest"
      : "center";
    hasScrolledInitialRef.current = true;
    if (typeof requestAnimationFrame === "function") {
      const rafId = requestAnimationFrame(() => {
        el.scrollIntoView({ block });
      });
      return () => cancelAnimationFrame(rafId);
    }
    el.scrollIntoView({ block });
  }, [selectedGame.id, detailsSidebarOpen, detailsFilteredGames.length]);

  const activeWidth = detailsSidebarOpen ? sidebarWidth : COLLAPSED_DETAILS_SIDEBAR_WIDTH;

  return (
    <div
      data-testid="details-sidebar"
      className={`relative border-r border-white/[0.06] flex flex-col min-h-0 shrink-0 select-none ${
        isResizing ? "" : "transition-[width] duration-300"
      }`}
      style={{
        width: `${activeWidth}px`,
        minWidth: `${activeWidth}px`,
        maxWidth: `${activeWidth}px`,
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
              <Input
                type="text"
                placeholder={t("game_details.filter_titles_placeholder")}
                value={detailsSearchQuery}
                onChange={(e) => setDetailsSearchQuery(e.target.value)}
                className="w-full h-7 pl-8 pr-7 rounded-lg text-xs border-white/[0.08] bg-white/[0.03] text-slate-100 placeholder:text-slate-500 focus-visible:border-indigo-500/50 focus-visible:ring-0"
              />
              {detailsSearchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setDetailsSearchQuery("")}
                  className="absolute right-1.5 h-5 w-5 text-slate-400 hover:text-white hover:bg-transparent"
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
            <ActionTooltip label={t("game_details.collapse_sidebar")}>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setDetailsSidebarOpen(false)}
                className="h-7 w-7 p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.08]"
                aria-label={t("game_details.collapse_sidebar")}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
            </ActionTooltip>
          </>
        ) : (
          <ActionTooltip label={t("game_details.expand_sidebar")} side="right">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDetailsSidebarOpen(true)}
              className="w-full h-auto py-1.5 flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.08]"
              aria-label={t("game_details.expand_sidebar")}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </ActionTooltip>
        )}
      </div>

      {/* Active filter badge if any filter is active */}
      {detailsSidebarOpen && (isFilterActive ? !isFilterActive("all") : activeFilter && activeFilter !== "all") && (
        <div className="px-3 py-1.5 border-b border-white/[0.06] bg-white/[0.03] flex items-center justify-between text-[11px] text-slate-300">
          <span className="truncate font-medium">
            Filtro: {activeFilter ? (activeFilter.startsWith("genre:") ? activeFilter.slice(6) : activeFilter.startsWith("completion:") ? activeFilter.slice(11) : activeFilter) : "Attivo"}
          </span>
          <ActionTooltip label={t("tooltips.reset_filters")}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setActiveFilter && setActiveFilter("all")}
              className="h-5 w-5 p-0.5 text-slate-400 hover:text-white hover:bg-transparent"
              aria-label={t("tooltips.reset_filters")}
            >
              <X className="w-3 h-3" />
            </Button>
          </ActionTooltip>
        </div>
      )}

      {/* Master list of games */}
      {detailsSidebarOpen && (
        <ScrollArea className="flex-1 min-h-0" viewportClassName="[&>div]:!block">
          <div className="divide-y divide-white/[0.04]">
          {detailsFilteredGames.map((game) => {
            const isSelected = selectedGame.id === game.id;
            const thumb = game.icon_image || game.cover_image;

            return (
              <div
                key={game.id}
                ref={isSelected ? selectedItemRef : undefined}
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
                    ? "bg-[var(--accent-primary)]/15 text-white border-l-[3px] border-[var(--accent-primary)] shadow-xs"
                    : "hover:bg-white/[0.04] text-slate-400 hover:text-slate-200 border-l-[3px] border-transparent"
                }`}
              >
                <div
                  className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center border border-white/[0.06] shrink-0 shadow-xs bg-black/40"
                >
                  <ListThumbCover thumb={thumb} title={game.title} />
                </div>

                <div className="flex-1 min-w-0">
                  <div
                    className={`text-xs font-bold leading-snug line-clamp-2 break-words ${
                      isSelected ? "text-white" : "text-slate-300"
                    }`}
                    title={game.title}
                  >
                    {game.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <StoreBadge library={game.library} variant="subtle" className="py-0 px-1 text-[9px] shrink-0" />
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
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </ScrollArea>
      )}

      {detailsSidebarOpen && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("game_details.resize_sidebar")}
          aria-valuemin={MIN_DETAILS_SIDEBAR_WIDTH}
          aria-valuemax={MAX_DETAILS_SIDEBAR_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          title={t("game_details.resize_sidebar")}
          onMouseDown={handleResizeMouseDown}
          onDoubleClick={handleResetWidth}
          onKeyDown={handleResizeKeyDown}
          className="group absolute top-0 -right-[3px] bottom-0 w-[7px] z-20 cursor-col-resize flex justify-center focus:outline-none"
        >
          <div
            className={`w-[2px] h-full transition-colors ${
              isResizing
                ? "bg-[var(--accent-primary)]"
                : "bg-transparent group-hover:bg-[var(--accent-primary)]/60 group-focus-visible:bg-[var(--accent-primary)]"
            }`}
          />
        </div>
      )}
    </div>
  );
};
