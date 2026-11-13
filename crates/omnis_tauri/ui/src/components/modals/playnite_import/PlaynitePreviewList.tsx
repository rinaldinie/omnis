import {
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Image as ImageIcon,
  Check,
  Search,
} from "lucide-react";
import {
  PlayniteBackupInspection,
  PlayniteBackupMatchSample,
  PlayniteUnmatchedGame,
  TranslateFn,
} from "../../../types";
import soundEffects from "../../../utils/soundEffects";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionTooltip } from "@/components/ui/tooltip";
import { formatPlaytime, getStoreBadgeClass } from "./helpers";

export interface PlaynitePreviewListProps {
  inspection: PlayniteBackupInspection;
  previewTab: "matched" | "unmatched";
  onPreviewTabChange: (tab: "matched" | "unmatched") => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  t: TranslateFn;
}

/** Filterable matched/unmatched games preview list for Playnite backup inspection. */
export function PlaynitePreviewList({
  inspection,
  previewTab,
  onPreviewTabChange,
  searchQuery,
  onSearchChange,
  t,
}: PlaynitePreviewListProps) {
  const matchedList: PlayniteBackupMatchSample[] = (inspection.sample_matches || []).map((item) =>
    typeof item === "string" ? { title: item } : item
  );
  const unmatchedList: PlayniteUnmatchedGame[] = inspection.unmatched_in_library || [];

  const normalizedQuery = searchQuery.toLowerCase();
  const filteredMatched = matchedList.filter((g) =>
    g.title.toLowerCase().includes(normalizedQuery)
  );
  const filteredUnmatched = unmatchedList.filter((g) =>
    g.title.toLowerCase().includes(normalizedQuery)
  );

  return (
    <div className="space-y-3 pt-1">
      {/* TAB BUTTONS & SEARCH */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <Tabs
          value={previewTab}
          onValueChange={(value) => {
            soundEffects.playSelect();
            onPreviewTabChange(value as "matched" | "unmatched");
          }}
        >
          <TabsList className="h-auto p-1 rounded-xl bg-slate-800/60 border border-white/5 gap-1">
            <TabsTrigger
              value="matched"
              className="px-3 py-1.5 rounded-lg text-xs font-bold gap-1.5 border-0 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300 data-[state=active]:border data-[state=active]:border-emerald-500/30 data-[state=inactive]:text-slate-400"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {t("playnite_import.tab_matched_games", {
                  count: inspection.matching_games_in_library,
                })}
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="unmatched"
              className="px-3 py-1.5 rounded-lg text-xs font-bold gap-1.5 border-0 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300 data-[state=active]:border data-[state=active]:border-amber-500/30 data-[state=inactive]:text-slate-400"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>
                {t("playnite_import.tab_unmatched_in_library", {
                  count: unmatchedList.length,
                })}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search input */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("playnite_import.search_preview_placeholder")}
            className="pl-8 pr-7 py-1.5 h-auto rounded-xl bg-slate-800/80 border-white/10 text-xs text-slate-200 placeholder:text-slate-500 focus-visible:ring-purple-500"
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
      </div>

      {/* Tab explanation note */}
      <p className="text-[11px] text-slate-400">
        {previewTab === "matched"
          ? t("playnite_import.matched_explanation")
          : t("playnite_import.unmatched_explanation")}
      </p>

      {/* LIST CONTAINER */}
      <ScrollArea className="rounded-xl border border-white/5 bg-slate-900/60 max-h-56" viewportClassName="p-2">
        <div className="divide-y divide-white/5 space-y-1">
          {previewTab === "matched" ? (
            filteredMatched.length > 0 ? (
              filteredMatched.map((item, idx) => (
                <MatchedGameRow key={idx} item={item} />
              ))
            ) : (
              <div className="py-6 text-center text-xs text-slate-500">
                {t("playnite_import.no_games_found")}
              </div>
            )
          ) : filteredUnmatched.length > 0 ? (
            filteredUnmatched.map((item, idx) => (
              <UnmatchedGameRow key={idx} item={item} />
            ))
          ) : (
            <div className="py-6 text-center text-xs text-slate-500">
              {t("playnite_import.no_games_found")}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function MatchedGameRow({ item }: { item: PlayniteBackupMatchSample }) {
  const store = item.library_id || "manual";
  const existingSec = item.existing_playtime_seconds || 0;
  const backupSec = item.backup_playtime_seconds || 0;

  return (
    <div className="flex items-center justify-between py-2 px-2.5 rounded-lg hover:bg-white/5 transition-colors text-xs gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="font-semibold text-slate-200 truncate" title={item.title}>
          {item.title}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border shrink-0 ${getStoreBadgeClass(
            store
          )}`}
        >
          {store}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {item.has_playtime_update ? (
          <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
            <Clock className="w-3 h-3" />
            <span>{formatPlaytime(existingSec)}</span>
            <span className="text-slate-500">→</span>
            <span className="font-bold">{formatPlaytime(backupSec)}</span>
          </span>
        ) : backupSec > 0 ? (
          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
            <Clock className="w-3 h-3 text-slate-500" />
            <span>{formatPlaytime(backupSec)}</span>
          </span>
        ) : null}

        {item.cover_available && (
          <ActionTooltip label="Cover disponibile nel backup">
            <span className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-300 flex items-center gap-1">
              <ImageIcon className="w-2.5 h-2.5" />
              <span>Cover</span>
            </span>
          </ActionTooltip>
        )}
        {item.background_available && (
          <ActionTooltip label="Sfondo disponibile nel backup">
            <span className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-300 flex items-center gap-1">
              <ImageIcon className="w-2.5 h-2.5" />
              <span>Sfondo</span>
            </span>
          </ActionTooltip>
        )}
      </div>
    </div>
  );
}

function UnmatchedGameRow({ item }: { item: PlayniteUnmatchedGame }) {
  const store = item.library_id || "manual";

  return (
    <div className="flex items-center justify-between py-2 px-2.5 rounded-lg hover:bg-white/5 transition-colors text-xs gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="font-semibold text-slate-200 truncate" title={item.title}>
          {item.title}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border shrink-0 ${getStoreBadgeClass(
            store
          )}`}
        >
          {store}
        </span>
      </div>
      <span className="text-[11px] text-slate-500 shrink-0 font-mono">
        ID: {item.external_id}
      </span>
    </div>
  );
}
