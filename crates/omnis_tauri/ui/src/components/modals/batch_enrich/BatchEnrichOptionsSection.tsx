import React from "react";
import { Layers, Clock, Image as ImageIcon, Filter, Check, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TranslateFn } from "../../../types";

export type BatchPresetMode =
  | "all"
  | "missing_artwork"
  | "missing_hltb"
  | "missing_achievements"
  | "filtered";

export interface BatchPresetCounts {
  missingArtwork: number;
  missingHltb: number;
  missingAchievements: number;
  all: number;
  filtered: number;
}

export interface BatchEnrichOptionsSectionProps {
  fetchMetadata: boolean;
  onToggleMetadata: () => void;
  fetchHltb: boolean;
  onToggleHltb: () => void;
  fetchAchievements: boolean;
  onToggleAchievements: () => void;
  onToggleAllTypes: () => void;
  presetMode: BatchPresetMode;
  onSelectPreset: (mode: BatchPresetMode) => void;
  counts: BatchPresetCounts;
  isRunning: boolean;
  t: TranslateFn;
}

export const BatchEnrichOptionsSection: React.FC<BatchEnrichOptionsSectionProps> = ({
  fetchMetadata,
  onToggleMetadata,
  fetchHltb,
  onToggleHltb,
  fetchAchievements,
  onToggleAchievements,
  onToggleAllTypes,
  presetMode,
  onSelectPreset,
  counts,
  isRunning,
  t,
}) => {
  const allTypesSelected = fetchMetadata && fetchHltb && fetchAchievements;

  const dataTypeCards = [
    {
      id: "metadata",
      active: fetchMetadata,
      onToggle: onToggleMetadata,
      icon: ImageIcon,
      titleKey: "batch_enrich.type_metadata",
      descKey: "batch_enrich.type_metadata_desc",
      activeBtnClass: "border-sky-500/80 bg-sky-500/10 hover:bg-sky-500/15 shadow-sm",
      activeIconClass: "bg-sky-500/20 text-sky-400",
      checkColorClass: "text-sky-400",
    },
    {
      id: "hltb",
      active: fetchHltb,
      onToggle: onToggleHltb,
      icon: Clock,
      titleKey: "batch_enrich.type_hltb",
      descKey: "batch_enrich.type_hltb_desc",
      activeBtnClass: "border-amber-500/80 bg-amber-500/10 hover:bg-amber-500/15 shadow-sm",
      activeIconClass: "bg-amber-500/20 text-amber-400",
      checkColorClass: "text-amber-400",
    },
    {
      id: "achievements",
      active: fetchAchievements,
      onToggle: onToggleAchievements,
      icon: Trophy,
      titleKey: "batch_enrich.type_achievements",
      descKey: "batch_enrich.type_achievements_desc",
      activeBtnClass: "border-indigo-500/80 bg-indigo-500/10 hover:bg-indigo-500/15 shadow-sm",
      activeIconClass: "bg-indigo-500/20 text-indigo-400",
      checkColorClass: "text-indigo-400",
    },
  ] as const;

  const presetOptions: Array<{
    mode: BatchPresetMode;
    icon: React.ComponentType<{ className?: string }>;
    labelKey: string;
    count: number;
    activeClass: string;
    badgeClass: string;
  }> = [
    {
      mode: "missing_artwork",
      icon: ImageIcon,
      labelKey: "batch_enrich.missing_artwork",
      count: counts.missingArtwork,
      activeClass: "bg-sky-500/20 hover:bg-sky-500/25 border-sky-500 text-sky-300 hover:text-sky-200 shadow-sm",
      badgeClass: "bg-sky-500/30 text-sky-200",
    },
    {
      mode: "missing_hltb",
      icon: Clock,
      labelKey: "batch_enrich.missing_hltb",
      count: counts.missingHltb,
      activeClass: "bg-amber-500/20 hover:bg-amber-500/25 border-amber-500 text-amber-300 hover:text-amber-200 shadow-sm",
      badgeClass: "bg-amber-500/30 text-amber-200",
    },
    {
      mode: "missing_achievements",
      icon: Trophy,
      labelKey: "batch_enrich.missing_achievements",
      count: counts.missingAchievements,
      activeClass: "bg-indigo-500/20 hover:bg-indigo-500/25 border-indigo-500 text-indigo-300 hover:text-indigo-200 shadow-sm",
      badgeClass: "bg-indigo-500/30 text-indigo-200",
    },
    {
      mode: "all",
      icon: Layers,
      labelKey: "batch_enrich.all_library",
      count: counts.all,
      activeClass: "bg-emerald-500/20 hover:bg-emerald-500/25 border-emerald-500 text-emerald-300 hover:text-emerald-200 shadow-sm",
      badgeClass: "bg-emerald-500/30 text-emerald-200",
    },
    {
      mode: "filtered",
      icon: Filter,
      labelKey: "batch_enrich.filtered",
      count: counts.filtered,
      activeClass: "bg-purple-500/20 hover:bg-purple-500/25 border-purple-500 text-purple-300 hover:text-purple-200 shadow-sm",
      badgeClass: "bg-purple-500/30 text-purple-200",
    },
  ];

  return (
    <>
      {/* SECTION 1: DATA TYPES TO DOWNLOAD */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-black uppercase tracking-wider text-slate-300">
            {t("batch_enrich.data_types")}
          </label>
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={isRunning}
            onClick={onToggleAllTypes}
            className="h-auto p-0 text-xs font-bold text-sky-400 hover:text-sky-300"
          >
            {allTypesSelected ? t("batch_enrich.deselect_all") : t("batch_enrich.type_all")}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {dataTypeCards.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                disabled={isRunning}
                onClick={item.onToggle}
                className={`h-auto w-full justify-start p-3 rounded-2xl border flex items-center gap-3 transition-all text-left whitespace-normal ${
                  item.active
                    ? item.activeBtnClass
                    : "border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.04] opacity-60"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    item.active ? item.activeIconClass : "bg-white/5 text-slate-400"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>{t(item.titleKey)}</span>
                    {item.active && <Check className={`w-3.5 h-3.5 ${item.checkColorClass}`} />}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">{t(item.descKey)}</div>
                </div>
              </Button>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: TARGET PRESET TABS */}
      <div className="space-y-3">
        <label className="text-xs font-black uppercase tracking-wider text-slate-300">
          {t("batch_enrich.target_group")}
        </label>

        <div className="flex flex-wrap gap-2">
          {presetOptions.map((opt) => {
            const Icon = opt.icon;
            const isSelected = presetMode === opt.mode;
            return (
              <Button
                key={opt.mode}
                type="button"
                variant="ghost"
                size="sm"
                disabled={isRunning}
                onClick={() => onSelectPreset(opt.mode)}
                className={`h-auto px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
                  isSelected
                    ? opt.activeClass
                    : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t(opt.labelKey)}</span>
                <Badge className={`px-1.5 py-0 border-0 text-[10px] ${opt.badgeClass}`}>
                  {opt.count}
                </Badge>
              </Button>
            );
          })}
        </div>
      </div>
    </>
  );
};
