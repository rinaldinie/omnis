import { useState } from "react";
import {
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  FileArchive,
} from "lucide-react";
import {
  PlayniteImportProgressPayload,
  PlayniteImportStats,
  TranslateFn,
} from "../../../types";
import { Button } from "@/components/ui/button";

export interface PlayniteIdleStepProps {
  onPickFile: () => void;
  onFileDropped: (path: string) => void;
  t: TranslateFn;
}

/** Drag-and-drop and file picker step when awaiting a Playnite `.zip` backup. */
export function PlayniteIdleStep({ onPickFile, onFileDropped, t }: PlayniteIdleStepProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.name.toLowerCase().endsWith(".zip")) {
              // Note: In browser context file.path might not exist, but pick_playnite_backup_file is primary
              const path = (file as File & { path?: string }).path || file.name;
              onFileDropped(path);
            }
          }
        }}
        className={`p-8 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center transition-all ${
          isDragOver
            ? "border-purple-400 bg-purple-500/10 scale-[1.01]"
            : "border-slate-700/80 bg-slate-800/30 hover:border-purple-500/50 hover:bg-slate-800/50"
        }`}
      >
        <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-4 shadow-lg">
          <FileArchive className="w-8 h-8" />
        </div>
        <h4 className="text-base font-bold text-white mb-1">
          {t("playnite_import.select_file_title")}
        </h4>
        <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
          {t("playnite_import.select_file_desc")}
        </p>

        <Button
          type="button"
          onClick={onPickFile}
          className="px-6 py-2.5 h-auto font-bold shadow-lg"
        >
          <FolderOpen className="w-4 h-4" />
          <span>{t("playnite_import.browse_button")}</span>
        </Button>
      </div>

      {/* Informational tip */}
      <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/5 text-sky-300 flex items-start gap-3 text-xs leading-relaxed">
        <AlertCircle className="w-4 h-4 shrink-0 text-sky-400 mt-0.5" />
        <div>{t("playnite_import.library_merge_tip")}</div>
      </div>
    </div>
  );
}

/** Loading indicator shown while inspecting the selected Playnite archive. */
export function PlayniteInspectingStep({ zipPath, t }: { zipPath: string; t: TranslateFn }) {
  return (
    <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shadow-lg animate-pulse">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
      <div>
        <h4 className="text-base font-bold text-white">
          {t("playnite_import.inspecting_title")}
        </h4>
        <p className="text-xs text-slate-400 max-w-sm mt-1">
          {t("playnite_import.inspecting_desc")}
        </p>
      </div>
      {zipPath && (
        <span className="px-3 py-1 rounded-md bg-black/40 border border-white/10 text-[11px] font-mono text-slate-300 truncate max-w-md">
          {zipPath}
        </span>
      )}
    </div>
  );
}

/** Progress bar view rendered while Playnite import is running. */
export function PlayniteImportingStep({
  progress,
  t,
}: {
  progress: PlayniteImportProgressPayload | null;
  t: TranslateFn;
}) {
  const percentage =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <div className="py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-white">
            {t("playnite_import.importing_title")}
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            {progress?.message || t("playnite_import.processing_items")}
          </p>
        </div>
        <span className="text-xs font-mono font-bold text-purple-400">
          {progress ? `${progress.current} / ${progress.total}` : "0 / 0"} ({percentage}%)
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden border border-white/5">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-200"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="p-4 rounded-xl bg-slate-800/40 border border-white/5 flex items-center gap-3">
        <RefreshCw className="w-4 h-4 text-purple-400 animate-spin shrink-0" />
        <span className="text-xs text-slate-300 truncate">
          {progress?.message || t("playnite_import.importing_in_progress")}
        </span>
      </div>
    </div>
  );
}

/** Completion summary cards rendered after a successful Playnite import. */
export function PlayniteCompletedStep({
  stats,
  t,
}: {
  stats: PlayniteImportStats;
  t: TranslateFn;
}) {
  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-col items-center justify-center text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-lg">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h4 className="text-base font-black text-white">
          {t("playnite_import.completed_title")}
        </h4>
        <p className="text-xs text-slate-400 max-w-md">
          {t("playnite_import.completed_desc")}
        </p>
      </div>

      {/* Result Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1 text-center">
          <span className="text-[11px] text-slate-400 font-medium">
            {t("playnite_import.stat_games_updated")}
          </span>
          <div className="text-2xl font-black text-emerald-400">
            {stats.games_merged}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/5 space-y-1 text-center">
          <span className="text-[11px] text-slate-400 font-medium">
            {t("playnite_import.stat_playtime_synced")}
          </span>
          <div className="text-2xl font-black text-sky-400">
            {stats.playtime_updated}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-1 text-center">
          <span className="text-[11px] text-slate-400 font-medium">
            {t("playnite_import.stat_images_extracted")}
          </span>
          <div className="text-2xl font-black text-purple-400">
            {stats.images_cached}
          </div>
        </div>

        {typeof stats.sessions_imported === "number" && stats.sessions_imported > 0 && (
          <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1 text-center">
            <span className="text-[11px] text-slate-400 font-medium">
              {t("statistics.sessions") || "Sessioni"}
            </span>
            <div className="text-2xl font-black text-emerald-400">
              {stats.sessions_imported}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Error alert view displayed when backup picking, inspection, or import fails. */
export function PlayniteErrorStep({
  errorMessage,
  t,
}: {
  errorMessage: string;
  t: TranslateFn;
}) {
  return (
    <div className="py-6 space-y-4">
      <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-sm text-rose-200">
            {t("playnite_import.error_title")}
          </div>
          <p className="text-rose-300/90 whitespace-pre-line leading-relaxed font-mono text-[11px]">
            {errorMessage}
          </p>
        </div>
      </div>
    </div>
  );
}
