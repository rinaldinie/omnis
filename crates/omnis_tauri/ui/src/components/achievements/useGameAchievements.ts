import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { api, TAURI_EVENTS } from "../../api";
import { Achievement, GameAchievementsSummary, GameDto } from "../../types";

const ACHIEVEMENT_STORES = ["steam", "xbox", "gog", "epic"];

/** Rarity tiers by share of players who unlocked the achievement */
export const ULTRA_RARE_PERCENT = 10;
export const RARE_PERCENT = 25;

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
          if (!disposed) setSummary(result);
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
