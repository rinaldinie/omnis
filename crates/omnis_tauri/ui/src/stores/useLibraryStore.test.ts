import { describe, it, expect, beforeEach, vi } from "vitest";
import { useLibraryStore } from "./useLibraryStore";
import { GameDto, LibraryCounts } from "../types";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    games: {
      getGames: vi.fn(),
      getCounts: vi.fn(),
    },
  },
}));

const mockGames: GameDto[] = [
  {
    id: "game-1",
    title: "The Witcher 3",
    library: "gog",
    is_installed: true,
    playtime_seconds: 7200,
    playtime_formatted: "2h 0m",
    critic_score: 93,
    release_date: "2015-05-18",
    description: "RPG adventure",
    cover_image: null,
    background_image: null,
    genres: ["RPG"],
    developers: ["CD Projekt Red"],
    is_hidden: false,
    is_favorite: true,
  },
  {
    id: "game-2",
    title: "Hades",
    library: "steam",
    is_installed: true,
    playtime_seconds: 1800,
    playtime_formatted: "30m",
    critic_score: 92,
    release_date: "2020-09-17",
    description: "Rogue-like action",
    cover_image: null,
    background_image: null,
    genres: ["Action", "Roguelike"],
    developers: ["Supergiant Games"],
    is_hidden: false,
    is_favorite: false,
  },
];

const mockCounts: LibraryCounts = {
  total: 2,
  installed: 2,
  steam: 1,
  gog: 1,
  epic: 0,
  xbox: 0,
  recent: 2,
  favorites: 1,
  action: 1,
  rpg: 1,
  strategy: 0,
  indie: 0,
};

describe("useLibraryStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLibraryStore.setState({
      games: [],
      counts: {
        total: 0,
        installed: 0,
        steam: 0,
        gog: 0,
        epic: 0,
        xbox: 0,
        recent: 0,
        favorites: 0,
        action: 0,
        rpg: 0,
        strategy: 0,
        indie: 0,
      },
      selectedGame: null,
      isLoading: false,
      error: null,
    });
  });

  it("should initialize with default empty values", () => {
    const state = useLibraryStore.getState();
    expect(state.games).toEqual([]);
    expect(state.counts.total).toBe(0);
    expect(state.selectedGame).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it("should update games and findGameById correctly", () => {
    const { setGames, findGameById } = useLibraryStore.getState();
    setGames(mockGames);

    expect(useLibraryStore.getState().games.length).toBe(2);
    expect(findGameById("game-2")?.title).toBe("Hades");
    expect(findGameById("non-existent")).toBeUndefined();
  });

  it("should select game and update state", () => {
    const { setSelectedGame } = useLibraryStore.getState();
    setSelectedGame(mockGames[0]);

    expect(useLibraryStore.getState().selectedGame?.id).toBe("game-1");
  });

  it("should load games and counts from api", async () => {
    vi.mocked(api.games.getGames).mockResolvedValue(mockGames);
    vi.mocked(api.games.getCounts).mockResolvedValue(mockCounts);

    await useLibraryStore.getState().loadGames();

    const state = useLibraryStore.getState();
    expect(state.games.length).toBe(2);
    expect(state.counts.total).toBe(2);
    expect(state.selectedGame?.id).toBe("game-1");
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("should handle error when api call fails", async () => {
    vi.mocked(api.games.getGames).mockRejectedValue(new Error("Network Error"));
    vi.mocked(api.games.getCounts).mockResolvedValue(mockCounts);

    await useLibraryStore.getState().loadGames();

    const state = useLibraryStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe("Network Error");
  });
});
