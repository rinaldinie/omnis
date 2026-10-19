import { convertFileSrc } from "@tauri-apps/api/core";
import { GameDto, invokeTauri } from "../types";

/**
 * In-memory client cache for resolved trailer URLs.
 */
const trailerCache = new Map<string, string | null>();

/**
 * Formats a video source (handling local file paths via Tauri convertFileSrc).
 */
export function formatVideoUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  if (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("asset:") ||
    src.startsWith("data:")
  ) {
    return src;
  }
  try {
    if (
      typeof window !== "undefined" &&
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    ) {
      return convertFileSrc(src);
    }
  } catch {
    // fallback
  }
  return src;
}

/**
 * Synchronous quick check for explicit custom link trailers or cached entries.
 */
export function resolveGameTrailerUrl(game: GameDto | null | undefined): string | null {
  if (!game) return null;

  const key = `${game.library}:${game.external_id || game.id}`;
  if (trailerCache.has(key)) {
    return trailerCache.get(key) || null;
  }

  // Check custom_links
  if (game.custom_links && Array.isArray(game.custom_links)) {
    for (const link of game.custom_links) {
      const titleLower = (link.title || "").toLowerCase();
      const urlLower = (link.url || "").toLowerCase();

      if (
        titleLower.includes("trailer") ||
        titleLower.includes("video") ||
        urlLower.endsWith(".mp4") ||
        urlLower.endsWith(".webm") ||
        urlLower.includes(".m3u8")
      ) {
        const formatted = formatVideoUrl(link.url);
        trailerCache.set(key, formatted);
        return formatted;
      }
    }
  }

  return null;
}

/**
 * Asynchronous trailer resolver: checks custom links, local trailers folder,
 * and remote store APIs (Steam HLS) via the Tauri backend command.
 */
export async function fetchGameTrailerUrl(
  game: GameDto | null | undefined
): Promise<string | null> {
  if (!game) return null;

  const key = `${game.library}:${game.external_id || game.id}`;
  if (trailerCache.has(key)) {
    return trailerCache.get(key) || null;
  }

  // 1. Quick check for custom links
  const immediate = resolveGameTrailerUrl(game);
  if (immediate) {
    return immediate;
  }

  // 2. Query Tauri backend command
  try {
    const backendResult = await invokeTauri<string | null>("get_game_trailer_url", {
      gameId: game.id,
      libraryId: game.library,
      externalId: game.external_id || "",
    });

    if (backendResult) {
      const formatted = formatVideoUrl(backendResult);
      trailerCache.set(key, formatted);
      return formatted;
    }
  } catch (err) {
    console.warn(`[trailers] Error resolving trailer for '${game.title}':`, err);
  }

  trailerCache.set(key, null);
  return null;
}
