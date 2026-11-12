import type { GameDto } from "../../types";

export interface SourceSummary {
  id: string;
  count: number;
}

export interface ImportSummary {
  /** Games per imported source, in the order the sources were imported */
  sources: SourceSummary[];
  /** All games in the library after the import */
  total: number;
  installed: number;
  /** Play time already known (e.g. imported from emulators), in whole hours */
  playtimeHours: number;
}

/** Summarizes the library right after the first import. */
export function buildImportSummary(games: GameDto[], importedSources: string[]): ImportSummary {
  const byLibrary = new Map<string, number>();
  let installed = 0;
  let playtimeSeconds = 0;
  for (const game of games) {
    const lib = (game.library || "").toLowerCase();
    byLibrary.set(lib, (byLibrary.get(lib) ?? 0) + 1);
    if (game.is_installed) installed += 1;
    playtimeSeconds += Math.max(0, game.playtime_seconds || 0);
  }
  return {
    sources: importedSources.map((id) => ({ id, count: byLibrary.get(id.toLowerCase()) ?? 0 })),
    total: games.length,
    installed,
    playtimeHours: Math.floor(playtimeSeconds / 3600),
  };
}

/** Whether better metadata needs API keys the user has not configured yet. */
export function needsMetadataKeys(
  providers: Array<{ id: string; is_enabled: boolean; has_configured_key?: boolean }>
): boolean {
  const keyed = providers.filter((p) => p.id === "igdb" || p.id === "steamgriddb");
  return keyed.length > 0 && !keyed.some((p) => p.is_enabled && p.has_configured_key);
}
