import React from "react";
import { X, Clock, Image as ImageIcon, Search, Check, Trophy } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ActionTooltip } from "@/components/ui/tooltip";
import { StoreBadge } from "../../common/StoreBadge";
import { GameDto, TranslateFn, formatImageUrl } from "../../../types";

export interface BatchEnrichGameListSectionProps {
  displayedGames: GameDto[];
  selectedIds: Set<string>;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onToggleSelectAll: () => void;
  onToggleGame: (id: string) => void;
  isRunning: boolean;
  t: TranslateFn;
}

export const BatchEnrichGameListSection: React.FC<BatchEnrichGameListSectionProps> = ({
  displayedGames,
  selectedIds,
  searchQuery,
  onSearchChange,
  onToggleSelectAll,
  onToggleGame,
  isRunning,
  t,
}) => {
  return (
    <>
      {/* SECTION 3: SEARCH & SELECTION TOOLBAR */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            type="text"
            disabled={isRunning}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("batch_enrich.search_placeholder")}
            className="h-8 pl-8 pr-7 rounded-xl text-xs bg-white/[0.04] border-white/10 focus-visible:ring-sky-500 text-white"
          />
          {searchQuery && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3 justify-between sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isRunning || displayedGames.length === 0}
            onClick={onToggleSelectAll}
            className="h-auto px-2 py-1 text-xs font-bold text-slate-300 hover:text-white gap-1.5"
          >
            <Check className="w-3.5 h-3.5 text-sky-400" />
            <span>
              {selectedIds.size === displayedGames.length && displayedGames.length > 0
                ? t("batch_enrich.deselect_all")
                : t("batch_enrich.select_all")}
            </span>
          </Button>

          <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
            {t("batch_enrich.download_selected", { count: selectedIds.size })}
          </span>
        </div>
      </div>

      {/* SECTION 4: INTERACTIVE GAME LIST */}
      <div
        className="border rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.2)",
          borderColor: "var(--border-color)",
        }}
      >
        {displayedGames.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 italic">
            {t("batch_enrich.no_games_matched")}
          </div>
        ) : (
          <ScrollArea className="max-h-[300px]">
            <div className="divide-y divide-white/[0.06]">
              {displayedGames.map((game) => {
                const isSelected = selectedIds.has(game.id);
                const hasCover = !!game.cover_image;
                const hasHltb =
                  !!game.extra_metadata && game.extra_metadata.includes("howlongtobeat");
                const hasAchievements =
                  !!game.extra_metadata && game.extra_metadata.includes("achievements");

                const resolvedCover = game.cover_image
                  ? formatImageUrl(game.cover_image)
                  : null;

                return (
                  <div
                    key={game.id}
                    onClick={() => !isRunning && onToggleGame(game.id)}
                    className={`flex items-center justify-between px-3.5 py-2.5 transition-colors cursor-pointer select-none ${
                      isSelected
                        ? "bg-sky-500/[0.07] hover:bg-sky-500/[0.12]"
                        : "hover:bg-white/[0.02] opacity-70"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Checkbox
                        checked={isSelected}
                        disabled={isRunning}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={() => !isRunning && onToggleGame(game.id)}
                        aria-label={game.title}
                        className="shrink-0"
                      />

                      {/* Thumbnail */}
                      <div className="w-8 h-10 rounded-md overflow-hidden bg-slate-800 shrink-0 border border-white/10 flex items-center justify-center">
                        {resolvedCover ? (
                          <img
                            src={resolvedCover}
                            alt={game.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-[10px] font-black text-slate-500 uppercase">
                            {(game.title || "??").slice(0, 2)}
                          </span>
                        )}
                      </div>

                      {/* Title & Store */}
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate max-w-sm sm:max-w-md">
                          {game.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <StoreBadge
                            library={game.library || "custom"}
                            showName
                            className="text-[10px] px-1.5 py-0.2"
                          />
                          {game.developers && game.developers.length > 0 && (
                            <span className="text-[10px] text-slate-400 truncate max-w-[150px]">
                              {game.developers[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status Indicators */}
                    <div className="flex items-center gap-2 shrink-0">
                      <ActionTooltip
                        label={
                          hasCover
                            ? t("batch_enrich.cover_present")
                            : t("batch_enrich.cover_missing")
                        }
                      >
                        <span
                          className={`p-1 rounded-md border text-[10px] flex items-center gap-1 ${
                            hasCover
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : "bg-white/[0.02] border-white/10 text-slate-600"
                          }`}
                        >
                          <ImageIcon className="w-3 h-3" />
                        </span>
                      </ActionTooltip>

                      <ActionTooltip
                        label={
                          hasHltb
                            ? t("batch_enrich.hltb_present")
                            : t("batch_enrich.hltb_missing")
                        }
                      >
                        <span
                          className={`p-1 rounded-md border text-[10px] flex items-center gap-1 ${
                            hasHltb
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                              : "bg-white/[0.02] border-white/10 text-slate-600"
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                        </span>
                      </ActionTooltip>

                      <ActionTooltip
                        label={
                          hasAchievements
                            ? t("batch_enrich.achievements_synced")
                            : t("batch_enrich.achievements_missing")
                        }
                      >
                        <span
                          className={`p-1 rounded-md border text-[10px] flex items-center gap-1 ${
                            hasAchievements
                              ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                              : "bg-white/[0.02] border-white/10 text-slate-600"
                          }`}
                        >
                          <Trophy className="w-3 h-3" />
                        </span>
                      </ActionTooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </>
  );
};
