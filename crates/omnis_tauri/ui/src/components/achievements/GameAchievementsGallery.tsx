import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { api, TAURI_EVENTS } from "../../api";
import { listen } from "@tauri-apps/api/event";
import { Trophy, Medal, RefreshCw, Sparkles, Award, Lock, CheckCircle2, AlertCircle, Settings } from "lucide-react";
import { GameAchievementsSummary, GameDto } from "../../types";
import { AchievementBadge } from "./AchievementBadge";
import soundEffects from "../../utils/soundEffects";
import { useTranslation } from "../../i18n";
import { useAchievementsConfig } from "./AchievementsSettingsTab";
import {
  getRarityTier,
  isUltraRareAchievement,
  isRareAchievement,
  isUncommonAchievement,
  isCommonAchievement,
} from "./useGameAchievements";

interface GameAchievementsGalleryProps {
  game: GameDto;
  isFullscreen?: boolean;
  isBigPicture?: boolean;
  focusedIndex?: number;
  onFocusIndexChange?: (idx: number) => void;
  onTotalAchievementsChange?: (total: number) => void;
}

type FilterType = "all" | "unlocked" | "locked" | "ultrarare" | "rare" | "uncommon" | "common";

export const GameAchievementsGallery: React.FC<GameAchievementsGalleryProps> = ({
  game,
  isFullscreen = false,
  isBigPicture = false,
  focusedIndex: controlledFocusedIndex,
  onFocusIndexChange,
  onTotalAchievementsChange,
}) => {
  const isFullscreenMode = isFullscreen || isBigPicture;
  const { t } = useTranslation();
  const config = useAchievementsConfig();
  const isSupportedStore =
    game.library === "steam" ||
    game.library === "xbox" ||
    game.library === "gog" ||
    game.library === "epic";

  const [summary, setSummary] = useState<GameAchievementsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(isSupportedStore);
  const [refreshing, setRefreshing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [localFocusedIndex, setLocalFocusedIndex] = useState<number>(-1);

  const effectiveFocusedIndex =
    controlledFocusedIndex !== undefined ? controlledFocusedIndex : localFocusedIndex;

  const setFocusedIndex = useCallback(
    (updater: number | ((prev: number) => number)) => {
      setLocalFocusedIndex((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        onFocusIndexChange?.(next);
        return next;
      });
    },
    [onFocusIndexChange]
  );

  const activeGameIdRef = useRef<string>(game.id);

  const openStoreSettings = useCallback(() => {
    soundEffects.playSelect();
    window.dispatchEvent(new CustomEvent("omnis:open-settings", { detail: { tab: "accounts" } }));
  }, []);

  const fetchAchievements = useCallback(async (isRefresh = false) => {
    const targetGameId = game.id;
    activeGameIdRef.current = targetGameId;

    if (!isSupportedStore) {
      setSummary(null);
      setLoading(false);
      return;
    }

    try {
      if (isRefresh) {
        setRefreshing(true);
        setSyncError(null);
        setSyncSuccess(false);
      } else {
        setLoading(true);
        setSummary(null);
        setSyncError(null);
        setSyncSuccess(false);
      }

      const result = isRefresh
        ? await api.achievements.refreshGameAchievements(targetGameId)
        : await api.achievements.getGameAchievements(targetGameId);

      // Discard stale responses if user switched games while request was in-flight
      if (activeGameIdRef.current === targetGameId) {
        setSummary(result);
        if (isRefresh) {
          setSyncSuccess(true);
          soundEffects.playUnlock?.();
          setTimeout(() => {
            if (activeGameIdRef.current === targetGameId) {
              setSyncSuccess(false);
            }
          }, 4500);
        }
      }
    } catch (err: any) {
      if (activeGameIdRef.current === targetGameId) {
        console.warn("Failed to load achievements:", err);
        if (isRefresh) {
          const errorMsg =
            typeof err === "string"
              ? err
              : err?.message || t("achievements.unknown_sync_error");
          setSyncError(errorMsg);
        }
      }
    } finally {
      if (activeGameIdRef.current === targetGameId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [game.id, isSupportedStore, t]);

  useEffect(() => {
    activeGameIdRef.current = game.id;
    setFocusedIndex(-1);
    fetchAchievements(false);
    return () => {
      if (activeGameIdRef.current === game.id) {
        activeGameIdRef.current = "";
      }
    };
  }, [fetchAchievements, game.id, setFocusedIndex]);

  // Pick up background syncs (startup pass, post-session refresh) without a loading flicker
  useEffect(() => {
    if (!isSupportedStore) return;
    const targetGameId = game.id;
    let unlisten: (() => void) | null = null;
    let disposed = false;
    listen<{ game_id: string }>(TAURI_EVENTS.ACHIEVEMENTS_UPDATED, async (event) => {
      if (event.payload.game_id !== targetGameId) return;
      try {
        const result = await api.achievements.getGameAchievements(targetGameId);
        if (activeGameIdRef.current === targetGameId) setSummary(result);
      } catch (err) {
        console.debug("Achievement reload after background sync failed:", err);
      }
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [game.id, isSupportedStore]);

  // Statistics calculation
  const stats = useMemo(() => {
    if (!summary || !summary.achievements) {
      return {
        total: 0,
        unlocked: 0,
        percentage: 0,
        totalPoints: 0,
        earnedPoints: 0,
        ultraRareCount: 0,
        rareCount: 0,
        uncommonCount: 0,
        commonCount: 0,
      };
    }

    let ultraRare = 0;
    let rare = 0;
    let uncommon = 0;
    let common = 0;

    for (const ach of summary.achievements) {
      if (ach.rarity_percentage !== null && ach.rarity_percentage !== undefined) {
        const tier = getRarityTier(
          ach.rarity_percentage,
          config.ultraRareThreshold,
          config.rareThreshold,
          config.uncommonThreshold
        );
        if (tier === "ultra_rare") {
          ultraRare++;
        } else if (tier === "rare") {
          rare++;
        } else if (tier === "uncommon") {
          uncommon++;
        } else {
          common++;
        }
      }
    }

    return {
      total: summary.total_count,
      unlocked: summary.unlocked_count,
      percentage: Math.round(summary.completion_percentage),
      totalPoints: summary.total_points,
      earnedPoints: summary.earned_points,
      ultraRareCount: ultraRare,
      rareCount: rare,
      uncommonCount: uncommon,
      commonCount: common,
    };
  }, [summary, config.ultraRareThreshold, config.rareThreshold, config.uncommonThreshold]);

  // Filtered achievements
  const filteredAchievements = useMemo(() => {
    if (!summary || !summary.achievements) return [];

    switch (activeFilter) {
      case "unlocked":
        return summary.achievements.filter((a) => a.is_unlocked);
      case "locked":
        return summary.achievements.filter((a) => !a.is_unlocked);
      case "ultrarare":
        return summary.achievements.filter((a) =>
          isUltraRareAchievement(a, config.ultraRareThreshold)
        );
      case "rare":
        return summary.achievements.filter((a) =>
          isRareAchievement(a, config.rareThreshold, config.ultraRareThreshold)
        );
      case "uncommon":
        return summary.achievements.filter((a) =>
          isUncommonAchievement(a, config.uncommonThreshold, config.rareThreshold)
        );
      case "common":
        return summary.achievements.filter((a) =>
          isCommonAchievement(a, config.uncommonThreshold)
        );
      default:
        return summary.achievements;
    }
  }, [summary, activeFilter, config.ultraRareThreshold, config.rareThreshold, config.uncommonThreshold]);

  // Notify parent of total filtered achievements
  useEffect(() => {
    onTotalAchievementsChange?.(filteredAchievements.length);
  }, [filteredAchievements.length, onTotalAchievementsChange]);

  const isCredentialsError =
    syncError &&
    (syncError.includes("ERR_CREDENTIALS_MISSING") ||
      syncError.toLowerCase().includes("api key") ||
      syncError.toLowerCase().includes("account store") ||
      syncError.toLowerCase().includes("non autenticato"));

  const renderFeedbackBanner = () => {
    if (syncError) {
      if (isCredentialsError) {
        return (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs animate-in fade-in">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold text-amber-200">
                  {t("achievements.config_required")}
                </div>
                <div className="text-amber-300/90 leading-relaxed">
                  {syncError.replace(/^ERR_[A-Z_]+:\s*/, "")}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={openStoreSettings}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer self-start sm:self-center"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{t("achievements.configure_store")}</span>
            </button>
          </div>
        );
      }

      return (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{syncError.replace(/^ERR_[A-Z_]+:\s*/, "")}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchAchievements(true)}
            disabled={refreshing}
            className="shrink-0 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold text-xs transition-colors cursor-pointer"
          >
            {t("achievements.retry")}
          </button>
        </div>
      );
    }

    if (syncSuccess) {
      return (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">
            {t("achievements.sync_success")}
          </span>
        </div>
      );
    }

    return null;
  };

  if (loading && !summary) {
    return (
      <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center gap-3 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
        <span className="text-xs font-medium">
          {t("achievements.loading")}
        </span>
      </div>
    );
  }

  // If no achievements found after load and not a supported store
  if (!summary || summary.total_count === 0) {
    if (
      game.library !== "steam" &&
      game.library !== "xbox" &&
      game.library !== "gog" &&
      game.library !== "epic"
    ) {
      return null; // Don't show empty widget for stores without achievement integration
    }

    const storeLabel = game.library.toUpperCase();

    return (
      <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trophy className="w-5 h-5 text-slate-500" />
            <div>
              <span className="text-xs text-slate-300 font-medium block">
                {t("achievements.no_achievements", { store: storeLabel })}
              </span>
              <span className="text-[11px] text-slate-500">
                {t("achievements.sync_hint")}
              </span>
            </div>
          </div>
          {!isFullscreenMode && (
            <button
              onClick={() => {
                soundEffects.playSelect();
                fetchAchievements(true);
              }}
              disabled={refreshing}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-xs font-bold text-white transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
              <span>
                {refreshing
                  ? t("achievements.syncing")
                  : t("achievements.sync")}
              </span>
            </button>
          )}
        </div>

        {renderFeedbackBanner()}
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-5">
      {/* Header & Stat Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-xs">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              <span>{t("achievements.title")}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-300 font-semibold">
                {stats.unlocked} / {stats.total}
              </span>
            </h3>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 font-medium">
              <span>{stats.percentage}% {t("achievements.completed")}</span>
              {config.showPoints && stats.totalPoints > 0 && (
                <>
                  <span className="text-white/20">•</span>
                  <span className="text-emerald-400 font-bold">
                    {stats.earnedPoints} / {stats.totalPoints} G
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Rarity & Refresh action */}
        <div className="flex items-center gap-2 flex-wrap">
          {config.showRarityBadges && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {stats.ultraRareCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-400/10 border border-amber-400/30 text-[11px] font-bold text-amber-300 shadow-xs">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>{stats.ultraRareCount} {t("achievements.ultra_rare")}</span>
                </span>
              )}
              {stats.rareCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] font-bold text-amber-400 shadow-xs">
                  <Trophy className="w-3 h-3 text-amber-500" />
                  <span>{stats.rareCount} {t("achievements.rare")}</span>
                </span>
              )}
              {stats.uncommonCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-sky-400/10 border border-sky-400/30 text-[11px] font-bold text-sky-300 shadow-xs">
                  <Medal className="w-3 h-3 text-sky-400" />
                  <span>{stats.uncommonCount} {t("achievements.uncommon")}</span>
                </span>
              )}
              {stats.commonCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-400/10 border border-slate-400/30 text-[11px] font-bold text-slate-300 shadow-xs">
                  <Award className="w-3 h-3 text-slate-400" />
                  <span>{stats.commonCount} {t("achievements.common")}</span>
                </span>
              )}
            </div>
          )}

          {refreshing && (
            <span className="text-xs text-indigo-400 animate-pulse font-medium">
              {t("achievements.syncing")}
            </span>
          )}

          {!isFullscreenMode && (
            <button
              onClick={() => {
                soundEffects.playSelect();
                fetchAchievements(true);
              }}
              disabled={refreshing}
              title={t("achievements.refresh_title")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
              <span className="text-xs font-semibold">
                {t("achievements.sync")}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Sync Status Banner */}
      {renderFeedbackBanner()}

      {/* Progress Bar */}
      {config.showProgressBar && (
        <div className="w-full h-2 rounded-full bg-white/[0.05] overflow-hidden p-0.5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-400 transition-all duration-500 shadow-xs"
            style={{ width: `${Math.max(stats.percentage, 2)}%` }}
          />
        </div>
      )}

      {/* Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => {
            soundEffects.playNav();
            setActiveFilter("all");
          }}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
            activeFilter === "all"
              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
              : "bg-white/[0.04] text-slate-400 hover:text-slate-200 hover:bg-white/[0.08]"
          }`}
        >
          {t("achievements.all")} ({stats.total})
        </button>

        <button
          onClick={() => {
            soundEffects.playNav();
            setActiveFilter("unlocked");
          }}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeFilter === "unlocked"
              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
              : "bg-white/[0.04] text-slate-400 hover:text-slate-200 hover:bg-white/[0.08]"
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{t("achievements.unlocked")} ({stats.unlocked})</span>
        </button>

        <button
          onClick={() => {
            soundEffects.playNav();
            setActiveFilter("locked");
          }}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeFilter === "locked"
              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
              : "bg-white/[0.04] text-slate-400 hover:text-slate-200 hover:bg-white/[0.08]"
          }`}
        >
          <Lock className="w-3 h-3 text-slate-400" />
          <span>{t("achievements.locked")} ({stats.total - stats.unlocked})</span>
        </button>

        {stats.ultraRareCount > 0 && (
          <button
            onClick={() => {
              soundEffects.playNav();
              setActiveFilter("ultrarare");
            }}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeFilter === "ultrarare"
                ? "bg-amber-500 text-slate-950 font-black shadow-sm shadow-amber-500/30"
                : "bg-white/[0.04] text-amber-300 hover:bg-white/[0.08]"
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>{t("achievements.ultra_rare")} ({stats.ultraRareCount})</span>
          </button>
        )}

        {stats.rareCount > 0 && (
          <button
            onClick={() => {
              soundEffects.playNav();
              setActiveFilter("rare");
            }}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeFilter === "rare"
                ? "bg-amber-500 text-slate-950 font-black shadow-sm shadow-amber-500/30"
                : "bg-white/[0.04] text-amber-400 hover:bg-white/[0.08]"
            }`}
          >
            <Trophy className="w-3 h-3 text-amber-500" />
            <span>{t("achievements.rare")} ({stats.rareCount})</span>
          </button>
        )}

        {stats.uncommonCount > 0 && (
          <button
            onClick={() => {
              soundEffects.playNav();
              setActiveFilter("uncommon");
            }}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeFilter === "uncommon"
                ? "bg-sky-500 text-slate-950 font-black shadow-sm shadow-sky-500/30"
                : "bg-white/[0.04] text-sky-300 hover:bg-white/[0.08]"
            }`}
          >
            <Medal className="w-3 h-3 text-sky-400" />
            <span>{t("achievements.uncommon")} ({stats.uncommonCount})</span>
          </button>
        )}

        {stats.commonCount > 0 && (
          <button
            onClick={() => {
              soundEffects.playNav();
              setActiveFilter("common");
            }}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeFilter === "common"
                ? "bg-slate-300 text-slate-950 font-black shadow-sm shadow-slate-300/30"
                : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
            }`}
          >
            <Award className="w-3 h-3 text-slate-400" />
            <span>{t("achievements.common")} ({stats.commonCount})</span>
          </button>
        )}
      </div>

      {/* Achievements Badge Grid */}
      <div className="flex flex-wrap gap-3 pt-1">
        {filteredAchievements.map((ach, idx) => (
          <AchievementBadge
            key={ach.id}
            achievement={ach}
            size={isFullscreenMode ? "lg" : config.badgeSize}
            config={config}
            isFocused={isFullscreenMode && effectiveFocusedIndex === idx}
            onClick={() => soundEffects.playSelect()}
            onFocus={() => {
              setFocusedIndex(idx);
              soundEffects.playNav();
            }}
          />
        ))}

        {filteredAchievements.length === 0 && (
          <div className="py-8 w-full text-center text-xs text-slate-500 font-medium">
            {t("achievements.empty_filter")}
          </div>
        )}
      </div>
    </div>
  );
};
