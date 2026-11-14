import { useState, useEffect, useMemo, useRef } from "react";
import { Sparkles, Square, RefreshCw } from "lucide-react";
import { GameDto } from "../../types";
import { useTranslation } from "../../i18n";
import { useUiStore } from "../../stores";
import {
  cancelBackgroundMetadataDownload,
  startBatchEnrichment,
} from "../../services/metadataBackgroundRunner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  BatchEnrichOptionsSection,
  type BatchPresetMode,
} from "./batch_enrich/BatchEnrichOptionsSection";
import { BatchEnrichGameListSection } from "./batch_enrich/BatchEnrichGameListSection";

export type { BatchPresetMode };

export interface BatchEnrichModalProps {
  isOpen: boolean;
  onClose: () => void;
  allGames: GameDto[];
  filteredGames: GameDto[];
  onComplete: () => Promise<void>;
}

const ACHIEVEMENT_STORES = ["steam", "gog", "epic", "xbox"];

function supportsStoreAchievements(library?: string | null): boolean {
  const store = (library || "").toLowerCase();
  return ACHIEVEMENT_STORES.some((s) => store.includes(s));
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

  const metadataDownload = useUiStore((s) => s.metadataDownload);
  const isBackgroundRunning =
    metadataDownload?.status === "running" && metadataDownload.mode !== "single";

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
      allGames.filter(
        (g) =>
          supportsStoreAchievements(g.library) &&
          g.achievements_sync_status !== "available" &&
          g.achievements_sync_status !== "none" &&
          (!g.extra_metadata || !g.extra_metadata.includes("achievements"))
      ),
    [allGames]
  );

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

  const presetGamesRef = useRef(presetGames);
  presetGamesRef.current = presetGames;

  // Initial selection sync when preset changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(presetGamesRef.current.map((g) => g.id)));
    }
  }, [presetMode, isOpen]);

  const displayedGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return presetGames;
    return presetGames.filter(
      (g) =>
        (g.title || "").toLowerCase().includes(q) ||
        (g.library || "").toLowerCase().includes(q)
    );
  }, [presetGames, searchQuery]);

  if (!isOpen) return null;

  const handleToggleSelectAll = () => {
    const next = new Set(selectedIds);
    const allDisplayedSelected =
      selectedIds.size === displayedGames.length && displayedGames.length > 0;
    displayedGames.forEach((g) => {
      if (allDisplayedSelected) {
        next.delete(g.id);
      } else {
        next.add(g.id);
      }
    });
    setSelectedIds(next);
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

  const handleStartEnrichment = () => {
    const targetGameList = allGames.filter((g) => selectedIds.has(g.id));
    if (targetGameList.length === 0) return;
    if (!fetchMetadata && !fetchHltb && !fetchAchievements) return;
    if (isBackgroundRunning) return;

    startBatchEnrichment({
      games: targetGameList,
      fetchMetadata,
      fetchHltb,
      fetchAchievements,
      preparingLabel: t("batch_enrich.preparing"),
      achievementsLabel: t("batch_enrich.type_achievements"),
      onComplete,
    });
    onClose();
  };

  const handleCancelBackground = async () => {
    await cancelBackgroundMetadataDownload();
  };

  const bgPercent =
    isBackgroundRunning && metadataDownload && metadataDownload.total > 0
      ? Math.min(
          100,
          Math.round((metadataDownload.current / metadataDownload.total) * 100)
        )
      : 0;

  const noTypesSelected = !fetchMetadata && !fetchHltb && !fetchAchievements;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-w-4xl w-full max-h-[90vh] p-0 flex flex-col rounded-3xl overflow-hidden gap-0 text-foreground"
      >
        <DialogHeader className="flex-row items-center gap-3 px-6 py-4 border-b border-border bg-card shrink-0 space-y-0 text-left pr-14">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shrink-0"
            style={{
              backgroundColor: "var(--accent-primary)",
              boxShadow: "0 0 15px var(--accent-glow)",
            }}
          >
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-base font-bold text-foreground tracking-tight">
              {t("topbar.enrich_button")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t("topbar.enrich_tooltip")}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* CONTENT SCROLL */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 space-y-5">
            <BatchEnrichOptionsSection
              fetchMetadata={fetchMetadata}
              onToggleMetadata={() => setFetchMetadata((v) => !v)}
              fetchHltb={fetchHltb}
              onToggleHltb={() => setFetchHltb((v) => !v)}
              fetchAchievements={fetchAchievements}
              onToggleAchievements={() => setFetchAchievements((v) => !v)}
              onToggleAllTypes={handleSelectAllTypes}
              presetMode={presetMode}
              onSelectPreset={setPresetMode}
              counts={{
                missingArtwork: missingArtworkGames.length,
                missingHltb: missingHltbGames.length,
                missingAchievements: missingAchievementsGames.length,
                all: allGames.length,
                filtered: filteredGames.length,
              }}
              isRunning={isBackgroundRunning}
              t={t}
            />

            <BatchEnrichGameListSection
              displayedGames={displayedGames}
              selectedIds={selectedIds}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onToggleSelectAll={handleToggleSelectAll}
              onToggleGame={handleToggleGame}
              isRunning={isBackgroundRunning}
              t={t}
            />

            {/* ACTIVE BACKGROUND JOB NOTICE (when reopened while downloading) */}
            {isBackgroundRunning && metadataDownload && (
              <div className="p-4 rounded-2xl border border-sky-500/40 bg-sky-500/10 space-y-2.5 animate-in fade-in">
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className="font-semibold text-sky-300 truncate flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
                    <span className="truncate">
                      {t("batch_enrich.running_in_background", {
                        current: metadataDownload.current,
                        total: metadataDownload.total,
                      })}
                    </span>
                  </span>
                  {metadataDownload.total > 0 && (
                    <span className="font-bold text-white font-mono shrink-0">
                      {metadataDownload.current} / {metadataDownload.total} ({bgPercent}%)
                    </span>
                  )}
                </div>
                {metadataDownload.total > 0 && (
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-sky-500 via-indigo-500 to-amber-400"
                      style={{ width: `${bgPercent}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border bg-card shrink-0">
          {isBackgroundRunning ? (
            <>
              <Button
                type="button"
                variant="destructive"
                onClick={handleCancelBackground}
                className="px-4 py-2 h-auto font-bold shadow-md"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>{t("batch_enrich.stop")}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="px-5 py-2.5 h-auto font-bold text-muted-foreground hover:text-foreground"
              >
                {t("common.close")}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                onClick={handleStartEnrichment}
                disabled={selectedIds.size === 0 || noTypesSelected}
                className="px-5 py-2.5 h-auto font-bold shadow-lg"
                style={{ boxShadow: "0 0 15px var(--accent-glow)" }}
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {t("batch_enrich.download_selected", {
                    count: selectedIds.size,
                  })}
                </span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="px-5 py-2.5 h-auto font-bold text-muted-foreground hover:text-foreground"
              >
                {t("common.cancel")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
