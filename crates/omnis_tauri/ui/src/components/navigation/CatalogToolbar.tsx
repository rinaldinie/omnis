import React from "react";
import { Filter, ChevronDown, X, Layers, ZoomOut, ZoomIn } from "lucide-react";
import { GroupBy, TranslateFn, ViewMode } from "../../types";
import type { GameSortMode } from "../../utils/sortGames";
import FilterAndSortPopover, { FilterCounts } from "./FilterAndSortPopover";
import GroupByPopover from "./GroupByPopover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger, ActionTooltip } from "@/components/ui/tooltip";

export interface CatalogToolbarProps {
  viewMode: ViewMode;
  showFilterMenu: boolean;
  setShowFilterMenu: React.Dispatch<React.SetStateAction<boolean>>;
  sortMode: GameSortMode;
  setSortMode: (mode: GameSortMode) => void;
  selectedFlags: string[];
  toggleFlag: (flag: string) => void;
  selectedStatuses: string[];
  toggleStatus: (status: string) => void;
  selectedStores: string[];
  toggleStore: (store: string) => void;
  selectedGenres: string[];
  toggleGenre: (genre: string) => void;
  selectedFeatures: string[];
  toggleFeature: (feature: string) => void;
  clearAllFilters: () => void;
  totalActiveFilters: number;
  filterCounts: FilterCounts;
  availableGenres: string[];
  availableFeatures: string[];
  activeChips: Array<{ id: string; label: string }>;
  removeFilterChip: (id: string) => void;
  searchQuery: string;
  filteredGamesCount: number;
  totalGamesCount: number;
  showGroupByMenu: boolean;
  setShowGroupByMenu: React.Dispatch<React.SetStateAction<boolean>>;
  groupBy: GroupBy;
  setGroupBy: (mode: GroupBy) => void;
  currentGroupLabel: string;
  gridCardWidth: number;
  setGridCardWidth: React.Dispatch<React.SetStateAction<number>>;
  t: TranslateFn;
}

export const CatalogToolbar: React.FC<CatalogToolbarProps> = ({
  viewMode,
  showFilterMenu,
  setShowFilterMenu,
  sortMode,
  setSortMode,
  selectedFlags,
  toggleFlag,
  selectedStatuses,
  toggleStatus,
  selectedStores,
  toggleStore,
  selectedGenres,
  toggleGenre,
  selectedFeatures,
  toggleFeature,
  clearAllFilters,
  totalActiveFilters,
  filterCounts,
  availableGenres,
  availableFeatures,
  activeChips,
  removeFilterChip,
  searchQuery,
  filteredGamesCount,
  totalGamesCount,
  showGroupByMenu,
  setShowGroupByMenu,
  groupBy,
  setGroupBy,
  currentGroupLabel,
  gridCardWidth,
  setGridCardWidth,
  t,
}) => {
  if (viewMode === "stats") return null;

  const filterTrigger = (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className={`h-7 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 select-none ${
        totalActiveFilters > 0
          ? "bg-sky-600/30 border-sky-500 text-sky-200 hover:bg-sky-600/40"
          : "bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border-white/[0.08]"
      }`}
      title={t("filter_modal.title") || "Filtra e ordina"}
    >
      <Filter className="w-3.5 h-3.5 text-sky-400" />
      <span>{t("filter_modal.title") || "Filtra e ordina"}</span>
      {totalActiveFilters > 0 && (
        <Badge className="w-4 h-4 p-0 justify-center bg-sky-500 border-sky-500 text-slate-950 text-[10px] font-black">
          {totalActiveFilters}
        </Badge>
      )}
      <ChevronDown className="w-3 h-3 text-slate-400" />
    </Button>
  );

  const groupByTrigger = (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className={`h-7 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 select-none ${
        groupBy !== "none"
          ? "bg-sky-600/30 border-sky-500 text-sky-200 hover:bg-sky-600/40"
          : "bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border-white/[0.08]"
      }`}
      title={t("groups.group_by") || "Raggruppa per"}
    >
      <Layers className="w-3.5 h-3.5 text-sky-400" />
      <span>
        {t("views.group_by")}:{" "}
        <strong
          className={
            groupBy !== "none"
              ? "text-white font-bold"
              : "text-slate-400 font-medium"
          }
        >
          {currentGroupLabel}
        </strong>
      </span>
      <ChevronDown className="w-3 h-3 text-slate-400" />
    </Button>
  );

  return (
    <div
      className="h-11 min-h-[44px] px-6 border-b flex items-center justify-between select-none shrink-0 relative z-30"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-color)",
      }}
    >
      {/* Left: Filter & Sort Popover and Active Filter Chips */}
      <div className="flex-1 min-w-0 flex items-center gap-2.5 mr-4">
        <div className="relative shrink-0">
          <FilterAndSortPopover
            trigger={filterTrigger}
            isOpen={showFilterMenu}
            onOpenChange={setShowFilterMenu}
            sortMode={sortMode}
            onSortChange={setSortMode}
            selectedFlags={selectedFlags}
            onToggleFlag={toggleFlag}
            selectedStatuses={selectedStatuses}
            onToggleStatus={toggleStatus}
            selectedStores={selectedStores}
            onToggleStore={toggleStore}
            selectedGenres={selectedGenres}
            onToggleGenre={toggleGenre}
            selectedFeatures={selectedFeatures}
            onToggleFeature={toggleFeature}
            onClearAll={clearAllFilters}
            totalActiveFilters={totalActiveFilters}
            filterCounts={filterCounts}
            availableGenres={availableGenres}
            availableFeatures={availableFeatures}
          />
        </div>

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {activeChips.map((chip) => (
              <div
                key={chip.id}
                className="h-7 px-2.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-medium flex items-center gap-1.5 shrink-0 animate-in fade-in zoom-in-95 duration-100"
              >
                <span className="max-w-[140px] truncate">{chip.label}</span>
                <ActionTooltip label={t("filter_chips.remove", { label: chip.label })}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => removeFilterChip(chip.id)}
                    className="h-4 w-4 p-0.5 hover:text-white hover:bg-white/10 rounded"
                    aria-label={t("filter_chips.remove", { label: chip.label })}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </ActionTooltip>
              </div>
            ))}

            {totalActiveFilters > 1 && (
              <ActionTooltip label={t("app_misc.clear_filters")}>
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  onClick={clearAllFilters}
                  className="text-[11px] font-semibold text-rose-300 hover:text-rose-200 underline shrink-0 ml-1 whitespace-nowrap h-auto p-0"
                  aria-label={t("app_misc.clear_filters")}
                >
                  {t("app_misc.clear_all")}
                </Button>
              </ActionTooltip>
            )}
          </div>
        )}
      </div>

      {/* Right: Counter, GroupBy & Zoom Controls */}
      <div className="flex items-center gap-3.5 shrink-0">
        {/* Game Counter */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium shrink-0">
          {totalActiveFilters > 0 || searchQuery.trim().length > 0 ? (
            <>
              <span className="font-semibold text-sky-400">
                {filteredGamesCount}
              </span>
              <span className="text-slate-500 font-normal">
                / {totalGamesCount}{" "}
                {t("sidebar.all_games")?.toLowerCase() || "giochi"}
              </span>
            </>
          ) : (
            <span>
              {t(
                filteredGamesCount === 1
                  ? "app_status.games_count_one"
                  : "app_status.games_count_other",
                { count: filteredGamesCount }
              )}
            </span>
          )}
        </div>

        <div className="h-4 w-[1px] bg-white/[0.08] shrink-0" />

        {/* Group By Popover */}
        <div className="relative shrink-0">
          <GroupByPopover
            trigger={groupByTrigger}
            isOpen={showGroupByMenu}
            onOpenChange={setShowGroupByMenu}
            groupBy={groupBy}
            onSelectGroup={(mode) => setGroupBy(mode)}
          />
        </div>

        {/* Zoom Slider for Grid View */}
        {viewMode === "grid" && (
          <div className="flex items-center gap-2 pl-2 border-l border-white/[0.08]">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() =>
                    setGridCardWidth((w) => Math.max(140, w - 20))
                  }
                  className="h-6 w-6 p-1 hover:text-white hover:bg-white/5"
                  style={{ color: "var(--text-muted)" }}
                  aria-label={t("tooltips.poster_smaller")}
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("tooltips.poster_smaller")}</TooltipContent>
            </Tooltip>
            <Slider
              min={140}
              max={320}
              step={10}
              value={[gridCardWidth]}
              onValueChange={([val]) => setGridCardWidth(val)}
              className="w-24 cursor-pointer"
              title={t("tooltips.poster_width", { width: gridCardWidth })}
              aria-label={t("tooltips.poster_width", { width: gridCardWidth })}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() =>
                    setGridCardWidth((w) => Math.min(320, w + 20))
                  }
                  className="h-6 w-6 p-1 hover:text-white hover:bg-white/5"
                  style={{ color: "var(--text-muted)" }}
                  aria-label={t("tooltips.poster_larger")}
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("tooltips.poster_larger")}</TooltipContent>
            </Tooltip>
            <span
              className="text-[10px] font-mono w-10 text-right"
              style={{ color: "var(--text-muted)" }}
            >
              {gridCardWidth}px
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
