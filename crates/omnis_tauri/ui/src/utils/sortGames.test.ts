import { describe, it, expect } from "vitest";
import { sortGames, GAME_SORT_MODES } from "./sortGames";
import type { GameDto } from "../types";

function createMockGame(overrides: Partial<GameDto>): GameDto {
  return {
    id: "test-id",
    title: "Game Title",
    library: "steam",
    is_installed: true,
    playtime_seconds: 0,
    playtime_formatted: "0h",
    critic_score: null,
    release_date: null,
    description: null,
    cover_image: null,
    background_image: null,
    genres: [],
    developers: [],
    ...overrides,
  };
}

describe("sortGames utility", () => {
  it("exposes all supported sort modes", () => {
    expect(GAME_SORT_MODES).toContain("default");
    expect(GAME_SORT_MODES).toContain("title");
    expect(GAME_SORT_MODES).toContain("title_desc");
    expect(GAME_SORT_MODES).toContain("playtime");
    expect(GAME_SORT_MODES).toContain("score");
  });

  it("sorts by title ascending and descending", () => {
    const games = [
      createMockGame({ title: "Zelda" }),
      createMockGame({ title: "Apex Legends" }),
      createMockGame({ title: "Mario" }),
    ];

    const asc = sortGames(games, "title");
    expect(asc.map((g) => g.title)).toEqual(["Apex Legends", "Mario", "Zelda"]);

    const desc = sortGames(games, "title_desc");
    expect(desc.map((g) => g.title)).toEqual(["Zelda", "Mario", "Apex Legends"]);
  });

  it("sorts by playtime descending", () => {
    const games = [
      createMockGame({ title: "Game A", playtime_seconds: 100 }),
      createMockGame({ title: "Game B", playtime_seconds: 5000 }),
      createMockGame({ title: "Game C", playtime_seconds: 1200 }),
    ];

    const sorted = sortGames(games, "playtime");
    expect(sorted.map((g) => g.title)).toEqual(["Game B", "Game C", "Game A"]);
  });

  it("preserves untouched order on default mode", () => {
    const games = [
      createMockGame({ title: "Zelda" }),
      createMockGame({ title: "Apex Legends" }),
    ];

    const sorted = sortGames(games, "default");
    expect(sorted).toBe(games);
  });
});
