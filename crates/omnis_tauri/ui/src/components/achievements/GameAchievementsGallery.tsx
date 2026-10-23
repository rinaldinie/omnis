import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Trophy, RefreshCw, Sparkles, Award, Lock, CheckCircle2, AlertCircle, Settings } from "lucide-react";
import { Achievement, GameAchievementsSummary, GameDto } from "../../types";
import { AchievementBadge } from "./AchievementBadge";
import soundEffects from "../../utils/soundEffects";

interface GameAchievementsGalleryProps {
  game: GameDto;
  isBigPicture?: boolean;
}

type FilterType = "all" | "unlocked" | "locked" | "ultrarare";

export const GameAchievementsGallery: React.FC<GameAchievementsGalleryProps> = ({
  game,
  isBigPicture = false,
}) => {
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
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

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

      const cmd = isRefresh ? "refresh_game_achievements" : "get_game_achievements";
      const result = await invoke<GameAchievementsSummary>(cmd, {
        gameId: targetGameId,
      });

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
          const errorMsg = typeof err === "string" ? err : err?.message || "Errore sconosciuto durante la sincronizzazione.";
          setSyncError(errorMsg);
        }
      }
    } finally {
      if (activeGameIdRef.current === targetGameId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [game.id, isSupportedStore]);

  useEffect(() => {
    activeGameIdRef.current = game.id;
    fetchAchievements(false);
    return () => {
      if (activeGameIdRef.current === game.id) {
        activeGameIdRef.current = "";
      }
    };
  }, [fetchAchievements, game.id]);

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
        commonCount: 0,
      };
    }

    let ultraRare = 0;
    let rare = 0;
    let common = 0;

    for (const ach of summary.achievements) {
      if (ach.rarity_percentage !== null && ach.rarity_percentage !== undefined) {
        if (ach.rarity_percentage < 10.0) {
          ultraRare++;
        } else if (ach.rarity_percentage < 25.0) {
          rare++;
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
      commonCount: common,
    };
  }, [summary]);

  // Filtered achievements
  const filteredAchievements = useMemo(() => {
    if (!summary || !summary.achievements) return [];

    switch (activeFilter) {
      case "unlocked":
        return summary.achievements.filter((a) => a.is_unlocked);
      case "locked":
        return summary.achievements.filter((a) => !a.is_unlocked);
      case "ultrarare":
        return summary.achievements.filter(
          (a) =>
            a.rarity_percentage !== null &&
            a.rarity_percentage !== undefined &&
            a.rarity_percentage < 10.0
        );
      default:
        return summary.achievements;
    }
  }, [summary, activeFilter]);

  // Gamepad / Keyboard navigation in Big Picture mode
  useEffect(() => {
    if (!isBigPicture) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredAchievements.length === 0) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = (prev + 1) % filteredAchievements.length;
          soundEffects.playNav();
          return next;
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = (prev - 1 + filteredAchievements.length) % filteredAchievements.length;
          soundEffects.playNav();
          return next;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isBigPicture, filteredAchievements.length]);

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
                <div className="font-bold text-amber-200">Configurazione Store richiesta</div>
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
              <span>Configura Store</span>
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
            Riprova
          </button>
        </div>
      );
    }

    if (syncSuccess) {
      return (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">Obiettivi sincronizzati con successo dallo store!</span>
        </div>
      );
    }

    return null;
  };

  if (loading && !summary) {
    return (
      <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center gap-3 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
        <span className="text-xs font-medium">Caricamento obiettivi in corso...</span>
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
                Nessun obiettivo registrato o sincronizzato per questo gioco su {storeLabel}.
              </span>
              <span className="text-[11px] text-slate-500">
                Clicca su sincronizza per recuperare i progressi dallo store.
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              soundEffects.playSelect();
              fetchAchievements(true);
            }}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-xs font-bold text-white transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
            <span>{refreshing ? "Sincronizzazione..." : "Sincronizza"}</span>
          </button>
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
              <span>Obiettivi</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-300 font-semibold">
                {stats.unlocked} / {stats.total}
              </span>
            </h3>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 font-medium">
              <span>{stats.percentage}% Completato</span>
              {stats.totalPoints > 0 && (
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
        <div className="flex items-center gap-2">
          {stats.ultraRareCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-400/10 border border-amber-400/30 text-[11px] font-bold text-amber-300 shadow-xs">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>{stats.ultraRareCount} Ultra-Rari</span>
            </span>
          )}

          {refreshing && (
            <span className="text-xs text-indigo-400 animate-pulse font-medium">
              Sincronizzazione...
            </span>
          )}

          <button
            onClick={() => {
              soundEffects.playSelect();
              fetchAchievements(true);
            }}
            disabled={refreshing}
            title="Aggiorna obiettivi dallo store"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
            <span className="text-xs font-semibold">Sincronizza</span>
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      {renderFeedbackBanner()}

      {/* Progress Bar */}
      <div className="w-full h-2 rounded-full bg-white/[0.05] overflow-hidden p-0.5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-400 transition-all duration-500 shadow-xs"
          style={{ width: `${Math.max(stats.percentage, 2)}%` }}
        />
      </div>

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
          Tutti ({stats.total})
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
          <span>Sbloccati ({stats.unlocked})</span>
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
          <span>Da Sbloccare ({stats.total - stats.unlocked})</span>
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
            <span>Ultra-Rari ({stats.ultraRareCount})</span>
          </button>
        )}
      </div>

      {/* Achievements Badge Grid */}
      <div className="flex flex-wrap gap-3 pt-1">
        {filteredAchievements.map((ach, idx) => (
          <AchievementBadge
            key={ach.id}
            achievement={ach}
            size={isBigPicture ? "lg" : "md"}
            isFocused={isBigPicture && focusedIndex === idx}
            onClick={() => soundEffects.playSelect()}
            onFocus={() => {
              setFocusedIndex(idx);
              soundEffects.playNav();
            }}
          />
        ))}

        {filteredAchievements.length === 0 && (
          <div className="py-8 w-full text-center text-xs text-slate-500 font-medium">
            Nessun obiettivo corrisponde al filtro selezionato.
          </div>
        )}
      </div>
    </div>
  );
};
