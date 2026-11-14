import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { api, TAURI_EVENTS } from "../../api";
import { useLibraryStore } from "../../stores";
import { Achievement, AchievementsSyncStatus, GameAchievementsSummary, GameDto } from "../../types";

const ACHIEVEMENT_STORES = ["steam", "xbox", "gog", "epic"];

/** Updates a single game's cached `achievements_sync_status` in the library store when it changes. */
export function syncLibraryGameAchievementStatus(
  gameId: string,
  syncStatus?: AchievementsSyncStatus
): void {
  if (!syncStatus) return;
  const { setGames, setSelectedGame } = useLibraryStore.getState();
  setGames((prev) =>
    prev.some((g) => g.id === gameId && g.achievements_sync_status !== syncStatus)
      ? prev.map((g) =>
          g.id === gameId ? { ...g, achievements_sync_status: syncStatus } : g
        )
      : prev
  );
  setSelectedGame((prev) =>
    prev && prev.id === gameId && prev.achievements_sync_status !== syncStatus
      ? { ...prev, achievements_sync_status: syncStatus }
      : prev
  );
}

export type RarityTier = "ultra_rare" | "rare" | "uncommon" | "common";

/** Rarity tiers by share of players who unlocked the achievement (SuccessStory / PlayStation standards) */
export const ULTRA_RARE_PERCENT = 5.0;
export const RARE_PERCENT = 20.0;
export const UNCOMMON_PERCENT = 50.0;

/** Computes the rarity tier of an achievement based on global unlock percentage */
export function getRarityTier(
  percentage: number | null | undefined,
  ultraRareThreshold: number = ULTRA_RARE_PERCENT,
  rareThreshold: number = RARE_PERCENT,
  uncommonThreshold: number = UNCOMMON_PERCENT
): RarityTier {
  if (percentage === null || percentage === undefined) return "common";
  if (percentage <= ultraRareThreshold) return "ultra_rare";
  if (percentage <= rareThreshold) return "rare";
  if (percentage <= uncommonThreshold) return "uncommon";
  return "common";
}

/** Checks if an achievement is ultra-rare according to the configured threshold (default <= 5%) */
export function isUltraRareAchievement(
  achievement: { rarity_percentage?: number | null } | number | null | undefined,
  threshold: number = ULTRA_RARE_PERCENT
): boolean {
  const p = typeof achievement === "number" ? achievement : achievement?.rarity_percentage;
  return p !== null && p !== undefined && p <= threshold;
}

/** Checks if an achievement is rare according to the configured thresholds (default > 5% and <= 20%) */
export function isRareAchievement(
  achievement: { rarity_percentage?: number | null } | number | null | undefined,
  rareThreshold: number = RARE_PERCENT,
  ultraRareThreshold: number = ULTRA_RARE_PERCENT
): boolean {
  const p = typeof achievement === "number" ? achievement : achievement?.rarity_percentage;
  return p !== null && p !== undefined && p > ultraRareThreshold && p <= rareThreshold;
}

/** Checks if an achievement is uncommon according to the configured thresholds (default > 20% and <= 50%) */
export function isUncommonAchievement(
  achievement: { rarity_percentage?: number | null } | number | null | undefined,
  uncommonThreshold: number = UNCOMMON_PERCENT,
  rareThreshold: number = RARE_PERCENT
): boolean {
  const p = typeof achievement === "number" ? achievement : achievement?.rarity_percentage;
  return p !== null && p !== undefined && p > rareThreshold && p <= uncommonThreshold;
}

/** Checks if an achievement is common according to the configured threshold (default > 50%) */
export function isCommonAchievement(
  achievement: { rarity_percentage?: number | null } | number | null | undefined,
  uncommonThreshold: number = UNCOMMON_PERCENT
): boolean {
  const p = typeof achievement === "number" ? achievement : achievement?.rarity_percentage;
  return p !== null && p !== undefined && p > uncommonThreshold;
}

/** Resolves UI accent color based on achievement rarity tier or percentage */
export function getRarityColor(
  percent: number | null | undefined,
  ultraRareThreshold: number = ULTRA_RARE_PERCENT,
  rareThreshold: number = RARE_PERCENT,
  uncommonThreshold: number = UNCOMMON_PERCENT
): string {
  if (percent === null || percent === undefined) return "rgba(255, 255, 255, 0.55)";
  const tier = getRarityTier(percent, ultraRareThreshold, rareThreshold, uncommonThreshold);
  switch (tier) {
    case "ultra_rare":
      return "#fbbf24"; // golden amber
    case "rare":
      return "#f59e0b"; // warm gold / amber-500
    case "uncommon":
      return "#38bdf8"; // silver / sky-400
    case "common":
      return "#94a3b8"; // bronze / slate-400
  }
}

/** Icon to show for an achievement: cached local file first, then the locked or unlocked store image */
export function achievementIconSrc(achievement: Achievement): string {
  if (achievement.local_icon_path) {
    try {
      return convertFileSrc(achievement.local_icon_path);
    } catch {
      return achievement.icon_unlocked_url;
    }
  }
  if (achievement.is_unlocked || !achievement.icon_locked_url) {
    return achievement.icon_unlocked_url;
  }
  return achievement.icon_locked_url;
}

export function supportsAchievements(game: Pick<GameDto, "library"> | null | undefined): boolean {
  return !!game && ACHIEVEMENT_STORES.includes(game.library);
}

/**
 * Cached achievements of a game, reloaded when a background sync updates it.
 * `summary` is null while loading and for stores without achievement integration.
 */
export function useGameAchievements(game: GameDto | null | undefined) {
  const gameId = game?.id ?? null;
  const supported = supportsAchievements(game);
  const [summary, setSummary] = useState<GameAchievementsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(supported);

  useEffect(() => {
    setSummary(null);
    if (!gameId || !supported) {
      setLoading(false);
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;
    const load = () =>
      api.achievements
        .getGameAchievements(gameId)
        .then((result) => {
          if (!disposed) {
            setSummary(result);
            syncLibraryGameAchievementStatus(gameId, result.sync_status);
          }
        })
        .catch((err) => console.warn("Failed to load achievements:", err))
        .finally(() => {
          if (!disposed) setLoading(false);
        });

    setLoading(true);
    load();

    // Pick up background syncs (startup pass, post-session refresh) without a loading flicker
    listen<{ game_id: string }>(TAURI_EVENTS.ACHIEVEMENTS_UPDATED, (event) => {
      if (event.payload.game_id === gameId) load();
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
  }, [gameId, supported]);

  return { summary, loading, supported };
}
