import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Archive,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  Image as ImageIcon,
  Check,
  DownloadCloud,
  FileArchive,
  ArrowRight,
  Library,
  Layers,
  Search,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  PlayniteBackupInspection,
  PlayniteBackupImportOptions,
  PlayniteImportStats,
  PlayniteImportProgressPayload,
  PlayniteBackupMatchSample,
  PlayniteUnmatchedGame,
} from "../../types";
import { useTranslation } from "../../i18n";
import soundEffects from "../../utils/soundEffects";

export type PlayniteImportStep =
  | "idle"
  | "inspecting"
  | "preview"
  | "importing"
  | "completed"
  | "error";

export interface PlayniteImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function PlayniteImportModal({
  isOpen,
  onClose,
  onSuccess,
}: PlayniteImportModalProps) {
  const { t } = useTranslation();

  const [step, setStep] = useState<PlayniteImportStep>("idle");
  const [zipPath, setZipPath] = useState<string>("");
  const [inspection, setInspection] = useState<PlayniteBackupInspection | null>(null);
  const [updatePlaytime, setUpdatePlaytime] = useState<boolean>(true);
  const [importImages, setImportImages] = useState<boolean>(true);
  const [progress, setProgress] = useState<PlayniteImportProgressPayload | null>(null);
  const [stats, setStats] = useState<PlayniteImportStats | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<"matched" | "unmatched">("matched");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Reset state whenever modal is opened
  useEffect(() => {
    if (isOpen) {
      setStep("idle");
      setZipPath("");
      setInspection(null);
      setUpdatePlaytime(true);
      setImportImages(true);
      setProgress(null);
      setStats(null);
      setErrorMessage("");
      setIsDragOver(false);
      setPreviewTab("matched");
      setSearchQuery("");
    }
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (step === "importing") return; // Prevent closing while import is executing
    soundEffects.playSelect();
    onClose();
  };

  const handlePickFile = async () => {
    soundEffects.playSelect();
    try {
      const selected = await invoke<string | null>("pick_playnite_backup_file");
      if (selected) {
        setZipPath(selected);
        startInspection(selected);
      }
    } catch (err: unknown) {
      console.error("Failed to pick backup file:", err);
      setErrorMessage(typeof err === "string" ? err : String(err));
      setStep("error");
    }
  };

  const startInspection = async (filePath: string) => {
    setStep("inspecting");
    setErrorMessage("");
    try {
      const result = await invoke<PlayniteBackupInspection>("inspect_playnite_backup", {
        zipPath: filePath,
      });
      setInspection(result);
      setStep("preview");
      soundEffects.playSelect();
    } catch (err: unknown) {
      console.error("Inspection failed:", err);
      setErrorMessage(
        typeof err === "string"
          ? err
          : (err as { message?: string })?.message || String(err)
      );
      setStep("error");
    }
  };

  const handleStartImport = async () => {
    if (!zipPath) return;
    soundEffects.playSelect();
    setStep("importing");
    setProgress({ current: 0, total: inspection?.matching_games_in_library || 0, message: "" });
    setErrorMessage("");

    // Setup event listener for progress updates
    try {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
      unlistenRef.current = await listen<PlayniteImportProgressPayload>(
        "playnite://import-progress",
        (event) => {
          setProgress(event.payload);
        }
      );

      const options: PlayniteBackupImportOptions = {
        image_cache_dir: null,
        import_images: importImages,
        update_playtime: updatePlaytime,
        dry_run: false,
      };

      const result = await invoke<PlayniteImportStats>("execute_playnite_import", {
        zipPath,
        options,
      });

      setStats(result);
      setStep("completed");
      soundEffects.playUnlock();
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      console.error("Execute import failed:", err);
      setErrorMessage(
        typeof err === "string"
          ? err
          : (err as { message?: string })?.message || String(err)
      );
      setStep("error");
    } finally {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    }
  };

  const formatPlaytime = (seconds: number = 0) => {
    if (!seconds || seconds <= 0) return "0m";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes > 0 ? `${minutes}m` : ""}`.trim();
    }
    return `${minutes}m`;
  };

  const getStoreBadge = (store?: string) => {
    const s = (store || "manual").toLowerCase();
    switch (s) {
      case "steam":
        return "bg-sky-500/20 text-sky-300 border-sky-500/30";
      case "epic":
        return "bg-slate-700/60 text-slate-200 border-slate-600/50";
      case "gog":
        return "bg-purple-500/20 text-purple-300 border-purple-500/30";
      case "xbox":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
      case "amazon":
        return "bg-amber-500/20 text-amber-300 border-amber-500/30";
      default:
        return "bg-slate-800 text-slate-400 border-slate-700";
    }
  };

  const renderPreviewSection = () => {
    if (!inspection) return null;

    const matchedList: PlayniteBackupMatchSample[] = (inspection.sample_matches || []).map((item) =>
      typeof item === "string" ? { title: item } : item
    );
    const unmatchedList: PlayniteUnmatchedGame[] = inspection.unmatched_in_library || [];

    const filteredMatched = matchedList.filter((g) =>
      g.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const filteredUnmatched = unmatchedList.filter((g) =>
      g.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <div className="space-y-3 pt-1">
        {/* TAB BUTTONS & SEARCH */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-800/60 border border-white/5">
            <button
              type="button"
              onClick={() => {
                soundEffects.playSelect();
                setPreviewTab("matched");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                previewTab === "matched"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {t("playnite_import.tab_matched_games", {
                  count: inspection.matching_games_in_library,
                })}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundEffects.playSelect();
                setPreviewTab("unmatched");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                previewTab === "unmatched"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>
                {t("playnite_import.tab_unmatched_in_library", {
                  count: unmatchedList.length,
                })}
              </span>
            </button>
          </div>

          {/* Search input */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("playnite_import.search_preview_placeholder")}
              className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-slate-800/80 border border-white/10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
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
        <div className="rounded-xl border border-white/5 bg-slate-900/60 p-2 max-h-56 overflow-y-auto custom-scrollbar divide-y divide-white/5 space-y-1">
          {previewTab === "matched" ? (
            filteredMatched.length > 0 ? (
              filteredMatched.map((item, idx) => {
                const store = item.library_id || "manual";
                const existingSec = item.existing_playtime_seconds || 0;
                const backupSec = item.backup_playtime_seconds || 0;
                const hasPlaytimeUpdate = item.has_playtime_update;

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 px-2.5 rounded-lg hover:bg-white/5 transition-colors text-xs gap-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="font-semibold text-slate-200 truncate" title={item.title}>
                        {item.title}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border shrink-0 ${getStoreBadge(
                          store
                        )}`}
                      >
                        {store}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Playtime info */}
                      {hasPlaytimeUpdate ? (
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

                      {/* Image availability badges */}
                      {item.cover_available && (
                        <span
                          className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-300 flex items-center gap-1"
                          title="Cover disponibile nel backup"
                        >
                          <ImageIcon className="w-2.5 h-2.5" />
                          <span>Cover</span>
                        </span>
                      )}
                      {item.background_available && (
                        <span
                          className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-300 flex items-center gap-1"
                          title="Sfondo disponibile nel backup"
                        >
                          <ImageIcon className="w-2.5 h-2.5" />
                          <span>Sfondo</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-6 text-center text-xs text-slate-500">
                {t("playnite_import.no_games_found")}
              </div>
            )
          ) : filteredUnmatched.length > 0 ? (
            filteredUnmatched.map((item, idx) => {
              const store = item.library_id || "manual";
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2 px-2.5 rounded-lg hover:bg-white/5 transition-colors text-xs gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="font-semibold text-slate-200 truncate" title={item.title}>
                      {item.title}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border shrink-0 ${getStoreBadge(
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
            })
          ) : (
            <div className="py-6 text-center text-xs text-slate-500">
              {t("playnite_import.no_games_found")}
            </div>
          )}
        </div>
      </div>
    );
  };

  const percentage =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div
        className="relative max-w-3xl w-full rounded-3xl border shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
        }}
      >
        {/* HEADER */}
        <div
          className="flex justify-between items-center px-6 py-4 border-b shrink-0"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-md"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <Archive className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">
                {t("playnite_import.modal_title")}
              </h3>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {t("playnite_import.modal_subtitle")}
              </p>
            </div>
          </div>
          {step !== "importing" && (
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full border flex items-center justify-center font-bold hover:bg-white/10 active:opacity-90 cursor-pointer"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
                color: "var(--text-muted)",
              }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* STEP 1: IDLE / FILE SELECTION */}
          {step === "idle" && (
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
                      const path = (file as any).path || file.name;
                      setZipPath(path);
                      startInspection(path);
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

                <button
                  type="button"
                  onClick={handlePickFile}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg flex items-center gap-2 cursor-pointer transition-all hover:brightness-110 active:opacity-90"
                  style={{ backgroundColor: "var(--accent-primary)" }}
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>{t("playnite_import.browse_button")}</span>
                </button>
              </div>

              {/* Informational tip */}
              <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/5 text-sky-300 flex items-start gap-3 text-xs leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 text-sky-400 mt-0.5" />
                <div>{t("playnite_import.library_merge_tip")}</div>
              </div>
            </div>
          )}

          {/* STEP 2: INSPECTING */}
          {step === "inspecting" && (
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
          )}

          {/* STEP 3: PREVIEW */}
          {step === "preview" && inspection && (
            <div className="space-y-5">
              {/* Selected file info */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-white/5 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-slate-400">{t("playnite_import.selected_file")}</span>
                  <span className="font-mono text-slate-200 truncate font-semibold" title={zipPath}>
                    {zipPath}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handlePickFile}
                  className="text-purple-400 hover:text-purple-300 transition-colors font-medium shrink-0 ml-3"
                >
                  {t("playnite_import.change_file")}
                </button>
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

              {/* Import Options Checkboxes */}
              <div className="p-4 rounded-xl border border-white/10 bg-slate-800/40 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={updatePlaytime}
                    onChange={(e) => {
                      soundEffects.playSelect();
                      setUpdatePlaytime(e.target.checked);
                    }}
                    className="mt-1 rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-white">
                      {t("playnite_import.option_update_playtime")}
                    </div>
                    <div className="text-[11px] text-slate-400 leading-normal">
                      {t("playnite_import.option_update_playtime_desc")}
                    </div>
                  </div>
                </label>

                <div className="border-t border-white/5 my-2" />

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={importImages}
                    onChange={(e) => {
                      soundEffects.playSelect();
                      setImportImages(e.target.checked);
                    }}
                    className="mt-1 rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-white">
                      {t("playnite_import.option_import_images")}
                    </div>
                    <div className="text-[11px] text-slate-400 leading-normal">
                      {t("playnite_import.option_import_images_desc")}
                    </div>
                  </div>
                </label>
              </div>

              {/* Enhanced Matches & Unmatched Preview */}
              {renderPreviewSection()}
            </div>
          )}

          {/* STEP 4: IMPORTING */}
          {step === "importing" && (
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
          )}

          {/* STEP 5: COMPLETED */}
          {step === "completed" && stats && (
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
          )}

          {/* STEP 6: ERROR */}
          {step === "error" && (
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
          )}
        </div>

        {/* FOOTER */}
        <div
          className="flex items-center justify-between px-6 py-4 border-t bg-black/40 shrink-0"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div>
            {step === "preview" && (
              <button
                type="button"
                onClick={() => {
                  soundEffects.playSelect();
                  setStep("idle");
                }}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                {t("playnite_import.change_file")}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step === "idle" && (
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 rounded-xl text-xs font-bold border hover:bg-white/10 transition-colors cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                {t("common.cancel")}
              </button>
            )}

            {step === "preview" && (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2 rounded-xl text-xs font-bold border hover:bg-white/10 transition-colors cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  {t("playnite_import.btn_cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleStartImport}
                  disabled={inspection?.matching_games_in_library === 0}
                  className="px-6 py-2 rounded-xl text-xs font-bold text-white shadow-lg hover:brightness-110 active:opacity-90 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: "var(--accent-primary)" }}
                >
                  <DownloadCloud className="w-4 h-4" />
                  <span>{t("playnite_import.btn_start_import")}</span>
                </button>
              </>
            )}

            {step === "completed" && (
              <button
                type="button"
                onClick={handleClose}
                className="px-6 py-2 rounded-xl text-xs font-bold text-white shadow-lg hover:brightness-110 active:opacity-90 flex items-center gap-2 cursor-pointer transition-all"
                style={{ backgroundColor: "var(--accent-primary)" }}
              >
                <Check className="w-4 h-4" />
                <span>{t("playnite_import.btn_close")}</span>
              </button>
            )}

            {step === "error" && (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2 rounded-xl text-xs font-bold border hover:bg-white/10 transition-colors cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playSelect();
                    setStep("idle");
                  }}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow-md hover:brightness-110 active:opacity-90 flex items-center gap-2 cursor-pointer transition-all"
                  style={{ backgroundColor: "var(--accent-primary)" }}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{t("playnite_import.btn_retry")}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
