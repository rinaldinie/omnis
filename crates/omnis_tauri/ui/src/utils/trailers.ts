import { GameDto } from "../types";

/**
 * Resolves an ambient trailer video URL for a given game.
 * Supports Steam store CDN direct MP4/WebM videos and custom trailer links.
 */
export function resolveGameTrailerUrl(game: GameDto | null | undefined): string | null {
  if (!game) return null;

  // 1. Check custom_links for explicit trailer or video MP4/WebM links
  if (game.custom_links && Array.isArray(game.custom_links)) {
    for (const link of game.custom_links) {
      const titleLower = (link.title || "").toLowerCase();
      const urlLower = (link.url || "").toLowerCase();

      if (
        titleLower.includes("trailer") ||
        titleLower.includes("video") ||
        urlLower.endsWith(".mp4") ||
        urlLower.endsWith(".webm")
      ) {
        return link.url;
      }
    }
  }

  // 2. Steam games: resolve direct native MP4 trailer from Steam CDN
  if (game.library === "steam" && game.external_id && /^\d+$/.test(game.external_id)) {
    return `https://cdn.akamai.steamstatic.com/steam/apps/${game.external_id}/movie480.mp4`;
  }

  return null;
}
