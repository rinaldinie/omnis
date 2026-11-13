import { CheckCircle2, AlertCircle, Clock, Image as ImageIcon } from "lucide-react";
import { PlayniteBackupInspection, TranslateFn } from "../../../types";
import soundEffects from "../../../utils/soundEffects";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PlaynitePreviewList } from "./PlaynitePreviewList";

export interface PlaynitePreviewStepProps {
  inspection: PlayniteBackupInspection;
  zipPath: string;
  onPickFile: () => void;
  updatePlaytime: boolean;
  onToggleUpdatePlaytime: (checked: boolean) => void;
  importImages: boolean;
  onToggleImportImages: (checked: boolean) => void;
  previewTab: "matched" | "unmatched";
  onPreviewTabChange: (tab: "matched" | "unmatched") => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  t: TranslateFn;
}

/** Inspection summary, import option switches, and preview list for a selected Playnite backup. */
export function PlaynitePreviewStep({
  inspection,
  zipPath,
  onPickFile,
  updatePlaytime,
  onToggleUpdatePlaytime,
  importImages,
  onToggleImportImages,
  previewTab,
  onPreviewTabChange,
  searchQuery,
  onSearchChange,
  t,
}: PlaynitePreviewStepProps) {
  return (
    <div className="space-y-5">
      {/* Selected file info */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-white/5 text-xs">
        <div className="flex items-center gap-2 truncate">
          <span className="text-slate-400">{t("playnite_import.selected_file")}</span>
          <span className="font-mono text-slate-200 truncate font-semibold" title={zipPath}>
            {zipPath}
          </span>
        </div>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={onPickFile}
          className="h-auto p-0 text-purple-400 hover:text-purple-300 font-medium shrink-0 ml-3"
        >
          {t("playnite_import.change_file")}
        </Button>
      </div>

      {/* Statistics Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-white/10 bg-slate-800/40 space-y-1">
          <span className="text-[11px] text-slate-400 font-medium">
            {t("playnite_import.total_in_backup")}
          </span>
          <div className="text-2xl font-black text-white">
            {inspection.total_games_in_backup}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-1">
          <span className="text-[11px] text-emerald-300 font-medium flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            {t("playnite_import.matching_in_library")}
          </span>
          <div className="text-2xl font-black text-emerald-400">
            {inspection.matching_games_in_library}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-white/10 bg-slate-800/40 space-y-1">
          <span className="text-[11px] text-slate-400 font-medium">
            {t("playnite_import.non_matching_skipped")}
          </span>
          <div className="text-2xl font-black text-slate-400">
            {inspection.non_matching_games}
          </div>
        </div>
      </div>

      {/* Non-matching note */}
      {inspection.non_matching_games > 0 && (
        <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>{t("playnite_import.non_matching_note")}</span>
        </div>
      )}

      {/* Available updates sub-stats */}
      <div className="flex flex-wrap items-center gap-3 py-1">
        <span className="px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs flex items-center gap-2 font-medium">
          <Clock className="w-3.5 h-3.5 text-sky-400" />
          <span>
            {t("playnite_import.badge_playtime_updates", { count: inspection.playtime_updates_available })}
          </span>
        </span>
        <span className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs flex items-center gap-2 font-medium">
          <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
          <span>
            {t("playnite_import.badge_images_available", {
              count: inspection.missing_covers_available + inspection.missing_backgrounds_available,
            })}
          </span>
        </span>
      </div>

      {/* Import Options Switches */}
      <div className="p-4 rounded-xl border border-white/10 bg-slate-800/40 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-white">
              {t("playnite_import.option_update_playtime")}
            </div>
            <div className="text-[11px] text-slate-400 leading-normal">
              {t("playnite_import.option_update_playtime_desc")}
            </div>
          </div>
          <Switch
            checked={updatePlaytime}
            onCheckedChange={(checked) => {
              soundEffects.playSelect();
              onToggleUpdatePlaytime(checked);
            }}
            aria-label={t("playnite_import.option_update_playtime")}
          />
        </div>

        <div className="border-t border-white/5 my-2" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-white">
              {t("playnite_import.option_import_images")}
            </div>
            <div className="text-[11px] text-slate-400 leading-normal">
              {t("playnite_import.option_import_images_desc")}
            </div>
          </div>
          <Switch
            checked={importImages}
            onCheckedChange={(checked) => {
              soundEffects.playSelect();
              onToggleImportImages(checked);
            }}
            aria-label={t("playnite_import.option_import_images")}
          />
        </div>
      </div>

      <PlaynitePreviewList
        inspection={inspection}
        previewTab={previewTab}
        onPreviewTabChange={onPreviewTabChange}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        t={t}
      />
    </div>
  );
}
