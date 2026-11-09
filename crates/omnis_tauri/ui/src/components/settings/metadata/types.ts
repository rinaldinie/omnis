export const ALL_METADATA_SOURCES = [
  "steamgriddb",
  "steam",
  "igdb",
  "opencritic",
  "howlongtobeat",
  "gog",
];

export function normalizeProviderPriority(raw?: string[]): string[] {
  const result: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const normalized =
        item.toLowerCase() === "hltb" ? "howlongtobeat" : item.toLowerCase();
      if (ALL_METADATA_SOURCES.includes(normalized) && !result.includes(normalized)) {
        result.push(normalized);
      }
    }
  }
  for (const src of ALL_METADATA_SOURCES) {
    if (!result.includes(src)) {
      result.push(src);
    }
  }
  return result;
}

export type MetadataSubTab =
  | "igdb"
  | "steamgriddb"
  | "opencritic"
  | "hltb"
  | "pipeline";
