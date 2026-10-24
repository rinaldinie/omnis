import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Sparkles,
  X,
  Layers,
  Clock,
  Image as ImageIcon,
  Filter,
  CheckCircle2,
  AlertCircle,
  Square,
  RefreshCw,
  Search,
  Check,
  Trophy,
  BookOpen,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { GameDto, formatImageUrl, invokeTauri } from "../../types";
import { useTranslation } from "../../i18n";
import { StoreBadge } from "../StoreBadge";

export type BatchPresetMode =
  | "all"
  | "missing_artwork"
  | "missing_hltb"
  | "missing_achievements"
  | "filtered";

interface MetadataProgressPayload {
  current: number;
  total: number;
  title: string;
}

export interface BatchEnrichModalProps {
  isOpen: boolean;
  onClose: () => void;
  allGames: GameDto[];
  filteredGames: GameDto[];
  onComplete: () => Promise<void>;
}

export default function BatchEnrichModal({
  isOpen,
  onClose,
  allGames,
  filteredGames,
  onComplete,
}: BatchEnrichModalProps) {
  const { t } = useTranslation();

  // Data Types Selection
  const [fetchMetadata, setFetchMetadata] = useState<boolean>(true);
  const [fetchHltb, setFetchHltb] = useState<boolean>(true);
  const [fetchAchievements, setFetchAchievements] = useState<boolean>(true);

  // Filter Preset & Search
  const [presetMode, setPresetMode] = useState<BatchPresetMode>("missing_artwork");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Selected Game IDs
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    title: string;
  } | null>(null);
  const [resultMessage, setResultMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const isCancelledRef = useRef<boolean>(false);

  // Helper filters
  const missingArtworkGames = useMemo(
    () => allGames.filter((g) => !g.cover_image),
    [allGames]
  );
  const missingHltbGames = useMemo(
    () =>
      allGames.filter(
        (g) => !g.extra_metadata || !g.extra_metadata.includes("howlongtobeat")
      ),
    [allGames]
  );
  const missingAchievementsGames = useMemo(
    () =>
      allGames.filter((g) => {
        const store = (g.library || "").toLowerCase();
        const hasStoreAchievements =
          store.includes("steam") ||
          store.includes("gog") ||
          store.includes("epic") ||
          store.includes("xbox");
        if (!hasStoreAchievements) return false;
        return (
          !g.extra_metadata || !g.extra_metadata.includes("achievements")
        );
      }),
    [allGames]
  );

  // Get games matching current preset
  const presetGames = useMemo((): GameDto[] => {
    switch (presetMode) {
      case "all":
        return allGames;
      case "missing_artwork":
        return missingArtworkGames;
      case "missing_hltb":
        return missingHltbGames;
      case "missing_achievements":
        return missingAchievementsGames;
      case "filtered":
        return filteredGames;
      default:
        return allGames;
    }
  }, [
    presetMode,
    allGames,
    missingArtworkGames,
    missingHltbGames,
    missingAchievementsGames,
    filteredGames,
  ]);

  // Initial selection sync when preset changes or modal opens
  useEffect(() => {
    if (isOpen) {
      const initialSet = new Set(presetGames.map((g) => g.id));
      setSelectedIds(initialSet);
    }
  }, [presetMode, isOpen]);

  // Games filtered by search query
  const displayedGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return presetGames;
    return presetGames.filter(
      (g) =>
        (g.title || "").toLowerCase().includes(q) ||
        (g.library || "").toLowerCase().includes(q)
    );
  }, [presetGames, searchQuery]);

  // Listen to Tauri progress events during batch enrichment
  useEffect(() => {
    if (!isOpen) return;

    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await listen<MetadataProgressPayload>(
          "metadata-progress",
          (event) => {
            setProgress(event.payload);
          }
        );
      } catch (err) {
        console.warn("Failed to attach metadata-progress listener:", err);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleSelectAll = () => {
    if (selectedIds.size === displayedGames.length && displayedGames.length > 0) {
      // Deselect all displayed
      const next = new Set(selectedIds);
      displayedGames.forEach((g) => next.delete(g.id));
      setSelectedIds(next);
    } else {
      // Select all displayed
      const next = new Set(selectedIds);
      displayedGames.forEach((g) => next.add(g.id));
      setSelectedIds(next);
    }
  };

  const handleToggleGame = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSelectAllTypes = () => {
    const allActive = fetchMetadata && fetchHltb && fetchAchievements;
    setFetchMetadata(!allActive);
    setFetchHltb(!allActive);
    setFetchAchievements(!allActive);
  };

  const handleStartEnrichment = async () => {
    const targetGameList = allGames.filter((g) => selectedIds.has(g.id));
    if (targetGameList.length === 0) return;
    if (!fetchMetadata && !fetchHltb && !fetchAchievements) return;

    try {
      setIsRunning(true);
      isCancelledRef.current = false;
      setResultMessage(null);
      const totalSteps = targetGameList.length;

      setProgress({
        current: 0,
        total: totalSteps,
        title: t("batch_enrich.preparing"),
      });

      // Step 1: Run Metadata & Artwork Batch Download if selected
      if (fetchMetadata && !isCancelledRef.current) {
        const gameIds = targetGameList.map((g) => g.id);
        await invokeTauri<number>("download_batch_metadata", { gameIds });
      }

      // Step 2: Run HowLongToBeat if selected and metadata was not run (since metadata includes HLTB plugin)
      if (fetchHltb && !fetchMetadata && !isCancelledRef.current) {
        for (let i = 0; i < targetGameList.length; i++) {
          if (isCancelledRef.current) break;
          const game = targetGameList[i];
          setProgress({
            current: i + 1,
            total: totalSteps,
            title: `HowLongToBeat: ${game.title}`,
          });
          try {
            await invokeTauri("refresh_game_howlongtobeat", { gameId: game.id });
          } catch (e) {
            console.debug(`HLTB fetch skipped for ${game.title}:`, e);
          }
        }
      }

      // Step 3: Run Achievements if selected
      if (fetchAchievements && !isCancelledRef.current) {
        const achievementEligible = targetGameList.filter((g) => {
          const s = (g.library || "").toLowerCase();
          return (
            s.includes("steam") ||
            s.includes("gog") ||
            s.includes("epic") ||
            s.includes("xbox")
          );
        });

        for (let i = 0; i < achievementEligible.length; i++) {
          if (isCancelledRef.current) break;
          const game = achievementEligible[i];
          setProgress({
            current: i + 1,
            total: achievementEligible.length,
            title: `${t("batch_enrich.type_achievements")}: ${game.title}`,
          });
          try {
            await invokeTauri("refresh_game_achievements", { gameId: game.id });
          } catch (e) {
            console.debug(`Achievements fetch skipped for ${game.title}:`, e);
          }
        }
      }

      if (isCancelledRef.current) {
        setResultMessage({
          type: "info",
          text: t("batch_enrich.cancel_requested"),
        });
      } else {
        setResultMessage({
          type: "success",
          text: t("batch_enrich.completed", { count: targetGameList.length }),
        });
      }

      await onComplete();
    } catch (err: any) {
      setResultMessage({
        type: "error",
        text: t("batch_enrich.error", { error: String(err) }),
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancel = async () => {
    isCancelledRef.current = true;
    try {
      await invokeTauri("cancel_metadata_download");
      setResultMessage({
        type: "info",
        text: t("batch_enrich.cancel_requested"),
      });
    } catch (err) {
      console.warn("Failed to cancel metadata download:", err);
    }
  };

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  const allTypesSelected = fetchMetadata && fetchHltb && fetchAchievements;
  const noTypesSelected = !fetchMetadata && !fetchHltb && !fetchAchievements;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        {/* HEADER */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shrink-0"
              style={{
                backgroundColor: "var(--accent-primary)",
                boxShadow: "0 0 15px var(--accent-glow)",
              }}
            >
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {t("topbar.enrich_button")}
              </h2>
              <p className="text-xs text-slate-400">
                {t("topbar.enrich_tooltip")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENT SCROLL */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {/* SECTION 1: DATA TYPES TO DOWNLOAD */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-slate-300">
                Tipologia di Dati da Scaricare
              </label>
              <button
                type="button"
                disabled={isRunning}
                onClick={handleSelectAllTypes}
                className="text-xs font-bold text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
              >
                {allTypesSelected
                  ? t("batch_enrich.deselect_all")
                  : t("batch_enrich.type_all")}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Type 1: Metadata & Artwork */}
              <button
                type="button"
                disabled={isRunning}
                onClick={() => setFetchMetadata(!fetchMetadata)}
                className={`p-3 rounded-2xl border flex items-center gap-3 transition-all cursor-pointer text-left ${
                  fetchMetadata
                    ? "border-sky-500/80 bg-sky-500/10 shadow-sm"
                    : "border-white/10 hover:border-white/20 bg-white/[0.02] opacity-60"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    fetchMetadata
                      ? "bg-sky-500/20 text-sky-400"
                      : "bg-white/5 text-slate-400"
                  }`}
                >
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>{t("batch_enrich.type_metadata")}</span>
                    {fetchMetadata && (
                      <Check className="w-3.5 h-3.5 text-sky-400" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    Descrizioni, generi, copertine e sfondi
                  </div>
                </div>
              </button>

              {/* Type 2: HowLongToBeat */}
              <button
                type="button"
                disabled={isRunning}
                onClick={() => setFetchHltb(!fetchHltb)}
                className={`p-3 rounded-2xl border flex items-center gap-3 transition-all cursor-pointer text-left ${
                  fetchHltb
                    ? "border-amber-500/80 bg-amber-500/10 shadow-sm"
                    : "border-white/10 hover:border-white/20 bg-white/[0.02] opacity-60"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    fetchHltb
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-white/5 text-slate-400"
                  }`}
                >
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>{t("batch_enrich.type_hltb")}</span>
                    {fetchHltb && (
                      <Check className="w-3.5 h-3.5 text-amber-400" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    Tempi completamento storia e 100%
                  </div>
                </div>
              </button>

              {/* Type 3: Store Achievements */}
              <button
                type="button"
                disabled={isRunning}
                onClick={() => setFetchAchievements(!fetchAchievements)}
                className={`p-3 rounded-2xl border flex items-center gap-3 transition-all cursor-pointer text-left ${
                  fetchAchievements
                    ? "border-indigo-500/80 bg-indigo-500/10 shadow-sm"
                    : "border-white/10 hover:border-white/20 bg-white/[0.02] opacity-60"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    fetchAchievements
                      ? "bg-indigo-500/20 text-indigo-400"
                      : "bg-white/5 text-slate-400"
                  }`}
                >
                  <Trophy className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>{t("batch_enrich.type_achievements")}</span>
                    {fetchAchievements && (
                      <Check className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    Sincronizzazione obiettivi e icone
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* SECTION 2: TARGET PRESET TABS */}
          <div className="space-y-3">
            <label className="text-xs font-black uppercase tracking-wider text-slate-300">
              {t("batch_enrich.target_group")}
            </label>

            <div className="flex flex-wrap gap-2">
              {/* Preset 1: Missing Covers */}
              <button
                type="button"
                disabled={isRunning}
                onClick={() => setPresetMode("missing_artwork")}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  presetMode === "missing_artwork"
                    ? "bg-sky-500/20 border-sky-500 text-sky-300 shadow-sm"
                    : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>{t("batch_enrich.missing_artwork")}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-500/30 text-sky-200">
                  {missingArtworkGames.length}
                </span>
              </button>

              {/* Preset 2: Missing HLTB */}
              <button
                type="button"
                disabled={isRunning}
                onClick={() => setPresetMode("missing_hltb")}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  presetMode === "missing_hltb"
                    ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm"
                    : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{t("batch_enrich.missing_hltb")}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/30 text-amber-200">
                  {missingHltbGames.length}
                </span>
              </button>

              {/* Preset 3: Missing Achievements */}
              <button
                type="button"
                disabled={isRunning}
                onClick={() => setPresetMode("missing_achievements")}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  presetMode === "missing_achievements"
                    ? "bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-sm"
                    : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>{t("batch_enrich.missing_achievements")}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/30 text-indigo-200">
                  {missingAchievementsGames.length}
                </span>
              </button>

              {/* Preset 4: All Library */}
              <button
                type="button"
                disabled={isRunning}
                onClick={() => setPresetMode("all")}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  presetMode === "all"
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm"
                    : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{t("batch_enrich.all_library")}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/30 text-emerald-200">
                  {allGames.length}
                </span>
              </button>

              {/* Preset 5: Filtered View */}
              <button
                type="button"
                disabled={isRunning}
                onClick={() => setPresetMode("filtered")}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  presetMode === "filtered"
                    ? "bg-purple-500/20 border-purple-500 text-purple-300 shadow-sm"
                    : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{t("batch_enrich.filtered")}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-500/30 text-purple-200">
                  {filteredGames.length}
                </span>
              </button>
            </div>
          </div>

          {/* SECTION 3: SEARCH & SELECTION TOOLBAR */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                disabled={isRunning}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("batch_enrich.search_placeholder")}
                className="w-full h-8 pl-8 pr-7 rounded-xl text-xs bg-white/[0.04] border border-white/10 focus:border-sky-500 focus:outline-none text-white transition-all"
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

            <div className="flex items-center gap-3 justify-between sm:justify-end">
              <button
                type="button"
                disabled={isRunning || displayedGames.length === 0}
                onClick={handleToggleSelectAll}
                className="text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  {selectedIds.size === displayedGames.length &&
                  displayedGames.length > 0
                    ? t("batch_enrich.deselect_all")
                    : t("batch_enrich.select_all")}
                </span>
              </button>

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
              <div className="max-h-[300px] overflow-y-auto divide-y divide-white/[0.06] custom-scrollbar">
                {displayedGames.map((game) => {
                  const isSelected = selectedIds.has(game.id);
                  const hasCover = !!game.cover_image;
                  const hasHltb =
                    !!game.extra_metadata &&
                    game.extra_metadata.includes("howlongtobeat");
                  const hasAchievements =
                    !!game.extra_metadata &&
                    game.extra_metadata.includes("achievements");

                  const resolvedCover = game.cover_image
                    ? formatImageUrl(game.cover_image)
                    : null;

                  return (
                    <div
                      key={game.id}
                      onClick={() => !isRunning && handleToggleGame(game.id)}
                      className={`flex items-center justify-between px-3.5 py-2.5 transition-colors cursor-pointer select-none ${
                        isSelected
                          ? "bg-sky-500/[0.07] hover:bg-sky-500/[0.12]"
                          : "hover:bg-white/[0.02] opacity-70"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isRunning}
                          onChange={() => {}}
                          className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400 cursor-pointer shrink-0"
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
                        <span
                          title={
                            hasCover
                              ? "Copertina presente"
                              : "Copertina mancante"
                          }
                          className={`p-1 rounded-md border text-[10px] flex items-center gap-1 ${
                            hasCover
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : "bg-white/[0.02] border-white/10 text-slate-600"
                          }`}
                        >
                          <ImageIcon className="w-3 h-3" />
                        </span>

                        <span
                          title={
                            hasHltb ? "Dati HLTB presenti" : "Dati HLTB mancanti"
                          }
                          className={`p-1 rounded-md border text-[10px] flex items-center gap-1 ${
                            hasHltb
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                              : "bg-white/[0.02] border-white/10 text-slate-600"
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                        </span>

                        <span
                          title={
                            hasAchievements
                              ? "Obiettivi sincronizzati"
                              : "Obiettivi non presenti"
                          }
                          className={`p-1 rounded-md border text-[10px] flex items-center gap-1 ${
                            hasAchievements
                              ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                              : "bg-white/[0.02] border-white/10 text-slate-600"
                          }`}
                        >
                          <Trophy className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* PROGRESS BAR & STATUS */}
          {isRunning && progress && (
            <div className="p-4 rounded-2xl border border-sky-500/40 bg-sky-500/10 space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-sky-300 truncate max-w-sm sm:max-w-md flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
                  <span className="truncate">{progress.title}</span>
                </span>
                <span className="font-bold text-white font-mono shrink-0">
                  {progress.current} / {progress.total} ({percent}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-sky-500 via-indigo-500 to-amber-400"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}

          {/* RESULT FEEDBACK */}
          {resultMessage && (
            <div
              className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs ${
                resultMessage.type === "error"
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                  : resultMessage.type === "success"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-sky-500/40 bg-sky-500/10 text-sky-300"
              }`}
            >
              {resultMessage.type === "error" ? (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              )}
              <span className="font-medium">{resultMessage.text}</span>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          {isRunning ? (
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-95 transition-all shadow-md cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>{t("batch_enrich.stop")}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleStartEnrichment}
                disabled={selectedIds.size === 0 || noTypesSelected}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-lg hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                style={{
                  backgroundColor: "var(--accent-primary)",
                  boxShadow: "0 0 15px var(--accent-glow)",
                }}
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {t("batch_enrich.download_selected", {
                    count: selectedIds.size,
                  })}
                </span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
              >
                {resultMessage ? t("common.close") : t("common.cancel")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
