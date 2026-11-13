import React, { useState } from "react";
import { X, ChevronDown, ChevronUp, Check, SlidersHorizontal } from "lucide-react";
import { GameSortMode } from "../../utils/sortGames";
import { SteamIcon, EpicIcon, GogIcon, XboxIcon, SwitchIcon } from "../StoreBadge";
import { useTranslation } from "../../i18n";
import { getLocalizedGenre } from "../../utils/genres";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface FilterCounts {
  total: number;
  installed: number;
  favorites: number;
  recent: number;
  stores: Record<string, number>;
  statuses: Record<string, number>;
  genres: Record<string, number>;
  features: Record<string, number>;
}

export interface FilterAndSortPopoverProps {
  trigger: React.ReactNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sortMode: GameSortMode;
  onSortChange: (mode: GameSortMode) => void;
  selectedFlags: string[];
  onToggleFlag: (flag: string) => void;
  selectedStatuses: string[];
  onToggleStatus: (status: string) => void;
  selectedStores: string[];
  onToggleStore: (store: string) => void;
  selectedGenres: string[];
  onToggleGenre: (genre: string) => void;
  selectedFeatures: string[];
  onToggleFeature: (feature: string) => void;
  onClearAll: () => void;
  totalActiveFilters: number;
  filterCounts: FilterCounts;
  availableGenres: string[];
  availableFeatures: string[];
}

export default function FilterAndSortPopover({
  trigger,
  isOpen,
  onOpenChange,
  sortMode,
  onSortChange,
  selectedFlags,
  onToggleFlag,
  selectedStatuses,
  onToggleStatus,
  selectedStores,
  onToggleStore,
  selectedGenres,
  onToggleGenre,
  selectedFeatures,
  onToggleFeature,
  onClearAll,
  totalActiveFilters,
  filterCounts,
  availableGenres,
  availableFeatures,
}: FilterAndSortPopoverProps) {
  const { t, locale } = useTranslation();

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    sort: true,
    status: true,
    platform: true,
    genre: true,
    features: false,
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const sortOptions: Array<{ id: GameSortMode; label: string }> = [
    { id: "recent", label: t("sort_options.recent") || "Giocati di recente" },
    { id: "title", label: t("sort_options.title_asc") || "Alfabetico (A-Z)" },
    { id: "title_desc", label: t("sort_options.title_desc") || "Alfabetico (Z-A)" },
    { id: "release_date", label: t("sort_options.release_date") || "Data di rilascio" },
    { id: "playtime", label: t("sort_options.playtime") || "Tempo di gioco" },
    { id: "score", label: t("sort_options.score") || "Valutazione critica" },
    { id: "default", label: t("sort_options.default") || "Ordine predefinito" },
  ];

  const statusItems = [
    {
      id: "flag:installed",
      label: t("sidebar.installed"),
      checked: selectedFlags.includes("installed"),
      toggle: () => onToggleFlag("installed"),
      count: filterCounts.installed,
    },
    {
      id: "flag:favorites",
      label: t("sidebar.favorites"),
      checked: selectedFlags.includes("favorites"),
      toggle: () => onToggleFlag("favorites"),
      count: filterCounts.favorites,
    },
    {
      id: "status:Playing",
      label: t("completion_status.playing"),
      checked: selectedStatuses.some((s) => s.toLowerCase() === "playing"),
      toggle: () => onToggleStatus("Playing"),
      dot: "bg-sky-400",
      count: filterCounts.statuses["playing"] || 0,
    },
    {
      id: "status:Completed",
      label: t("completion_status.completed"),
      checked: selectedStatuses.some((s) => s.toLowerCase() === "completed"),
      toggle: () => onToggleStatus("Completed"),
      dot: "bg-emerald-400",
      count: filterCounts.statuses["completed"] || 0,
    },
    {
      id: "status:Beaten",
      label: t("completion_status.beaten"),
      checked: selectedStatuses.some((s) => s.toLowerCase() === "beaten"),
      toggle: () => onToggleStatus("Beaten"),
      dot: "bg-purple-400",
      count: filterCounts.statuses["beaten"] || 0,
    },
    {
      id: "status:PlanToPlay",
      label: t("completion_status.plan_to_play"),
      checked: selectedStatuses.some((s) => s.toLowerCase() === "plantoplay"),
      toggle: () => onToggleStatus("PlanToPlay"),
      dot: "bg-indigo-400",
      count: filterCounts.statuses["plantoplay"] || 0,
    },
    {
      id: "status:Backlog",
      label: t("completion_status.backlog"),
      checked: selectedStatuses.some((s) => s.toLowerCase() === "backlog"),
      toggle: () => onToggleStatus("Backlog"),
      dot: "bg-amber-400",
      count: filterCounts.statuses["backlog"] || 0,
    },
    {
      id: "status:Abandoned",
      label: t("completion_status.abandoned"),
      checked: selectedStatuses.some((s) => s.toLowerCase() === "abandoned"),
      toggle: () => onToggleStatus("Abandoned"),
      dot: "bg-rose-400",
      count: filterCounts.statuses["abandoned"] || 0,
    },
    {
      id: "status:NotPlayed",
      label: t("completion_status.not_played"),
      checked: selectedStatuses.some((s) => s.toLowerCase() === "notplayed"),
      toggle: () => onToggleStatus("NotPlayed"),
      dot: "bg-slate-400",
      count: filterCounts.statuses["notplayed"] || 0,
    },
  ];

  const storeItems = [
    {
      id: "steam",
      label: "Steam",
      icon: SteamIcon,
      checked: selectedStores.includes("steam"),
      count: filterCounts.stores["steam"] || 0,
    },
    {
      id: "epic",
      label: "Epic Games",
      icon: EpicIcon,
      checked: selectedStores.includes("epic"),
      count: filterCounts.stores["epic"] || 0,
    },
    {
      id: "gog",
      label: "GOG Galaxy",
      icon: GogIcon,
      checked: selectedStores.includes("gog"),
      count: filterCounts.stores["gog"] || 0,
    },
    {
      id: "xbox",
      label: "Xbox / PC Pass",
      icon: XboxIcon,
      checked: selectedStores.includes("xbox"),
      count: filterCounts.stores["xbox"] || 0,
    },
    {
      id: "switch",
      label: "Nintendo Switch",
      icon: SwitchIcon,
      checked: selectedStores.includes("switch"),
      count: filterCounts.stores["switch"] || 0,
    },
  ];

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-96 sm:w-[420px] overflow-hidden flex flex-col text-xs"
        style={{
          boxShadow: "0 20px 48px rgba(0,0,0,0.85)",
        }}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-sky-400" />
            <h2 className="font-bold text-sm text-foreground">
              {t("filter_modal.title") || "Filtra e ordina"}
            </h2>
            {totalActiveFilters > 0 && (
              <Badge className="w-5 h-5 p-0 justify-center bg-sky-500 border-sky-500 text-slate-950 font-black">
                {totalActiveFilters}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {totalActiveFilters > 0 && (
              <Button
                type="button"
                variant="link"
                size="xs"
                onClick={onClearAll}
                className="text-sky-400 hover:text-sky-300 h-auto p-0"
              >
                {t("filter_modal.clear_all") || "Cancella tutto"}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-6 w-6 rounded-lg"
              title={t("common.close") || "Chiudi"}
              aria-label={t("common.close") || "Chiudi"}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto max-h-[75vh] divide-y divide-white/[0.06] custom-scrollbar">
          {/* SECTION 1: SORT */}
          <div>
            <button
              type="button"
              onClick={() => toggleSection("sort")}
              className="w-full flex items-center justify-between py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-slate-200 hover:text-white transition-colors cursor-pointer select-none"
            >
              <span>{t("filter_modal.sort") || "Ordina per"}</span>
              {openSections.sort ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {openSections.sort && (
              <div className="px-4 pb-3 space-y-1">
                {sortOptions.map((opt) => {
                  const isSelected = sortMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onSortChange(opt.id)}
                      className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-white/[0.04] group cursor-pointer"
                    >
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                          isSelected
                            ? "border-sky-400 bg-sky-500/10"
                            : "border-slate-500 group-hover:border-slate-400"
                        }`}
                      >
                        {isSelected && (
                          <div className="w-2 h-2 rounded-full bg-sky-400" />
                        )}
                      </div>
                      <span
                        className={`text-xs ${
                          isSelected
                            ? "text-white font-semibold"
                            : "text-slate-300 group-hover:text-white"
                        }`}
                      >
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 2: STATUS */}
          <div>
            <button
              type="button"
              onClick={() => toggleSection("status")}
              className="w-full flex items-center justify-between py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-slate-200 hover:text-white transition-colors cursor-pointer select-none"
            >
              <span>{t("filter_modal.status") || "Stato"}</span>
              {openSections.status ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {openSections.status && (
              <div className="px-4 pb-3 grid grid-cols-2 gap-1.5">
                {statusItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.toggle}
                    className="flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-white/[0.04] group cursor-pointer truncate"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div
                        className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all ${
                          item.checked
                            ? "bg-sky-500 border-sky-500 text-slate-950 font-bold"
                            : "border-white/20 bg-white/[0.04] group-hover:border-white/40"
                        }`}
                      >
                        {item.checked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      {item.dot && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.dot}`}
                        />
                      )}
                      <span
                        className={`text-xs truncate ${
                          item.checked
                            ? "text-white font-semibold"
                            : "text-slate-300 group-hover:text-white"
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                    {item.count !== undefined && item.count > 0 && (
                      <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-1">
                        {item.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 3: PLATFORM / STORE */}
          <div>
            <button
              type="button"
              onClick={() => toggleSection("platform")}
              className="w-full flex items-center justify-between py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-slate-200 hover:text-white transition-colors cursor-pointer select-none"
            >
              <span>{t("filter_modal.platform") || "Piattaforma"}</span>
              {openSections.platform ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {openSections.platform && (
              <div className="px-4 pb-3 grid grid-cols-2 gap-1.5">
                {storeItems.map((store) => {
                  const Icon = store.icon;
                  return (
                    <button
                      key={store.id}
                      type="button"
                      onClick={() => onToggleStore(store.id)}
                      className="flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-white/[0.04] group cursor-pointer truncate"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div
                          className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all ${
                            store.checked
                              ? "bg-sky-500 border-sky-500 text-slate-950 font-bold"
                              : "border-white/20 bg-white/[0.04] group-hover:border-white/40"
                          }`}
                        >
                          {store.checked && (
                            <Check className="w-3 h-3 stroke-[3]" />
                          )}
                        </div>
                        <Icon className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                        <span
                          className={`text-xs truncate ${
                            store.checked
                              ? "text-white font-semibold"
                              : "text-slate-300 group-hover:text-white"
                          }`}
                        >
                          {store.label}
                        </span>
                      </div>
                      {store.count > 0 && (
                        <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-1">
                          {store.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 4: GENRE */}
          {availableGenres.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => toggleSection("genre")}
                className="w-full flex items-center justify-between py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-slate-200 hover:text-white transition-colors cursor-pointer select-none"
              >
                <span>{t("filter_modal.genre") || "Genere"}</span>
                {openSections.genre ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {openSections.genre && (
                <div className="px-4 pb-3 grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                  {availableGenres.map((genre) => {
                    const isChecked = selectedGenres.some(
                      (g) => g.toLowerCase() === genre.toLowerCase()
                    );
                    const count = filterCounts.genres[genre] || 0;
                    return (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => onToggleGenre(genre)}
                        className="flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-white/[0.04] group cursor-pointer truncate"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <div
                            className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all ${
                              isChecked
                                ? "bg-sky-500 border-sky-500 text-slate-950 font-bold"
                                : "border-white/20 bg-white/[0.04] group-hover:border-white/40"
                            }`}
                          >
                            {isChecked && (
                              <Check className="w-3 h-3 stroke-[3]" />
                            )}
                          </div>
                          <span
                            className={`text-xs truncate ${
                              isChecked
                                ? "text-white font-semibold"
                                : "text-slate-300 group-hover:text-white"
                            }`}
                          >
                            {getLocalizedGenre(genre, locale)}
                          </span>
                        </div>
                        {count > 0 && (
                          <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-1">
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SECTION 5: FEATURES */}
          {availableFeatures.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => toggleSection("features")}
                className="w-full flex items-center justify-between py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-slate-200 hover:text-white transition-colors cursor-pointer select-none"
              >
                <span>{t("filter_modal.features") || "Caratteristiche"}</span>
                {openSections.features ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {openSections.features && (
                <div className="px-4 pb-3 grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                  {availableFeatures.map((feat) => {
                    const isChecked = selectedFeatures.some(
                      (f) => f.toLowerCase() === feat.toLowerCase()
                    );
                    const count = filterCounts.features[feat] || 0;
                    return (
                      <button
                        key={feat}
                        type="button"
                        onClick={() => onToggleFeature(feat)}
                        className="flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-white/[0.04] group cursor-pointer truncate"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <div
                            className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all ${
                              isChecked
                                ? "bg-sky-500 border-sky-500 text-slate-950 font-bold"
                                : "border-white/20 bg-white/[0.04] group-hover:border-white/40"
                            }`}
                          >
                            {isChecked && (
                              <Check className="w-3 h-3 stroke-[3]" />
                            )}
                          </div>
                          <span
                            className={`text-xs truncate ${
                              isChecked
                                ? "text-white font-semibold"
                                : "text-slate-300 group-hover:text-white"
                            }`}
                          >
                            {feat}
                          </span>
                        </div>
                        {count > 0 && (
                          <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-1">
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
