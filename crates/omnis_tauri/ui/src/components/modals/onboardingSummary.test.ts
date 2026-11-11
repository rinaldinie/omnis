import { describe, expect, it } from "vitest";
import { buildImportSummary, needsMetadataKeys } from "./onboardingSummary";
import type { GameDto } from "../../types";

const game = (library: string, installed: boolean, playtime = 0): GameDto =>
  ({ library, is_installed: installed, playtime_seconds: playtime } as unknown as GameDto);

describe("buildImportSummary", () => {
  it("counts games per imported source and totals", () => {
    const games = [
      game("steam", true, 3600),
      game("steam", true),
      game("Switch", true, 82_440),
      game("epic", false),
      game("custom", true, 1800),
    ];
    const s = buildImportSummary(games, ["steam", "switch", "gog"]);
    expect(s.sources).toEqual([
      { id: "steam", count: 2 },
      { id: "switch", count: 1 },
      { id: "gog", count: 0 },
    ]);
    expect(s.total).toBe(5);
    expect(s.installed).toBe(4);
    expect(s.playtimeHours).toBe(24); // 87 840 s
  });

  it("handles an empty library", () => {
    expect(buildImportSummary([], ["steam"])).toEqual({
      sources: [{ id: "steam", count: 0 }],
      total: 0,
      installed: 0,
      playtimeHours: 0,
    });
  });
});

describe("needsMetadataKeys", () => {
  it("suggests keys only when neither IGDB nor SteamGridDB is usable", () => {
    const none = [
      { id: "igdb", is_enabled: true, has_configured_key: false },
      { id: "steamgriddb", is_enabled: true, has_configured_key: false },
      { id: "steam", is_enabled: true, has_configured_key: false },
    ];
    expect(needsMetadataKeys(none)).toBe(true);
    expect(
      needsMetadataKeys([{ id: "igdb", is_enabled: true, has_configured_key: true }, none[1]])
    ).toBe(false);
    expect(
      needsMetadataKeys([{ id: "igdb", is_enabled: false, has_configured_key: true }, none[1]])
    ).toBe(true);
    expect(needsMetadataKeys([{ id: "steam", is_enabled: true }])).toBe(false);
  });
});
