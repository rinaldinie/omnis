import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGameOperations } from "./useGameOperations";
import { api } from "../api";
import soundEffects from "../utils/soundEffects";
import { useLibraryStore, useUiStore } from "../stores";
import type { ActiveGameSession, GameDto, TranslateFn } from "../types";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      games: {
        ...actual.api.games,
        syncLibrary: vi.fn(),
        launchGame: vi.fn(),
        killRunningGame: vi.fn(),
        openGameInstallDir: vi.fn(),
        createDesktopShortcut: vi.fn(),
        verifyGameFiles: vi.fn(),
        uninstallGame: vi.fn(),
        removeGameFromLibrary: vi.fn(),
        enrichSingleGame: vi.fn(),
        refreshGameHowlongtobeat: vi.fn(),
        updateGameCompletionStatus: vi.fn(),
        setGameHidden: vi.fn(),
        setGameFavorite: vi.fn(),
        promoteDuplicateCopy: vi.fn(),
      },
      metadata: {
        ...actual.api.metadata,
        downloadAllMetadata: vi.fn(),
      },
      window: {
        ...actual.api.window,
        openFolder: vi.fn(),
      },
    },
  };
});

vi.mock("../utils/soundEffects", () => ({
  default: {
    playLaunch: vi.fn(),
    playSelect: vi.fn(),
  },
}));

const sampleGame: GameDto = {
  id: "g1",
  external_id: "100",
  title: "Hollow Knight",
  library: "steam",
  playtime_seconds: 3600,
  playtime_formatted: "1h",
  critic_score: null,
  release_date: null,
  description: null,
  cover_image: null,
  background_image: null,
  is_installed: true,
  is_favorite: false,
  is_hidden: false,
  genres: ["Metroidvania"],
  developers: ["Team Cherry"],
  publishers: ["Team Cherry"],
  features: [],
  custom_links: [],
};

const statusText: TranslateFn = (key, params) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

const t: TranslateFn = (key, params) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

describe("useGameOperations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLibraryStore.setState({
      games: [sampleGame],
      selectedGame: sampleGame,
    });
    useUiStore.setState({
      statusMessage: "",
      isSyncing: false,
      isGameRunning: false,
      activeGame: null,
      showKillConfirmModal: false,
      showUninstallModal: false,
      gameToUninstall: null,
    });
  });

  it("syncs library and reports count, then handles IPC sync error cleanly", async () => {
    const refreshLibrary = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.games.syncLibrary).mockResolvedValueOnce(12);

    const { result } = renderHook(() =>
      useGameOperations({
        refreshLibrary,
        statusText,
        t,
      })
    );

    await act(async () => {
      await result.current.handleSync();
    });

    expect(api.games.syncLibrary).toHaveBeenCalledTimes(1);
    expect(refreshLibrary).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().isSyncing).toBe(false);
    expect(useUiStore.getState().statusMessage).toBe('library_scanned_count:{"count":12}');

    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(api.games.syncLibrary).mockRejectedValueOnce(new Error("RPC timeout"));

    await act(async () => {
      await result.current.handleSync();
    });

    expect(useUiStore.getState().isSyncing).toBe(false);
    expect(useUiStore.getState().statusMessage).toBe('library_scan_error:{"error":"RPC timeout"}');
  });

  it("resets active running state when game launch IPC fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    useUiStore.setState({
      isGameRunning: true,
      activeGame: {
        session_id: "s1",
        game_id: "g1",
        title: "Hollow Knight",
        state: "launching",
        started_at: "2026-01-01T00:00:00Z",
        process_detected_at: null,
      } satisfies ActiveGameSession,
    });
    vi.mocked(api.games.launchGame).mockRejectedValueOnce("Executable missing");

    const { result } = renderHook(() =>
      useGameOperations({
        refreshLibrary: vi.fn().mockResolvedValue(undefined),
        statusText,
        t,
      })
    );

    await act(async () => {
      await result.current.handleLaunch("g1");
    });

    expect(soundEffects.playLaunch).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().isGameRunning).toBe(false);
    expect(useUiStore.getState().activeGame).toBeNull();
    expect(useUiStore.getState().statusMessage).toBe('launch_error:{"error":"Executable missing"}');
  });

  it("falls back to enrichSingleGame when direct HLTB refresh fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const updatedGame: GameDto = { ...sampleGame, title: "Hollow Knight: Voidheart" };
    vi.mocked(api.games.refreshGameHowlongtobeat).mockRejectedValueOnce(new Error("HLTB offline"));
    vi.mocked(api.games.enrichSingleGame).mockResolvedValueOnce(updatedGame);

    const { result } = renderHook(() =>
      useGameOperations({
        refreshLibrary: vi.fn().mockResolvedValue(undefined),
        statusText,
        t,
      })
    );

    await act(async () => {
      await result.current.handleRefreshHltb("g1");
    });

    expect(api.games.refreshGameHowlongtobeat).toHaveBeenCalledWith("g1");
    expect(api.games.enrichSingleGame).toHaveBeenCalledWith("g1");
    expect(useLibraryStore.getState().selectedGame?.title).toBe("Hollow Knight: Voidheart");
    expect(useLibraryStore.getState().games[0].title).toBe("Hollow Knight: Voidheart");
    expect(result.current.isEnrichingSingle).toBe(false);
  });

  it("removes confirmed game from library and clears selectedGame, skipping when cancelled", async () => {
    const refreshLibrary = vi.fn().mockResolvedValue(undefined);
    const originalConfirm = window.confirm;
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    window.confirm = confirmMock;
    vi.mocked(api.games.removeGameFromLibrary).mockResolvedValueOnce(undefined);

    try {
      const { result } = renderHook(() =>
        useGameOperations({
          refreshLibrary,
          statusText,
          t,
        })
      );

      await act(async () => {
        await result.current.handleRemoveFromLibrary("g1");
      });
      expect(api.games.removeGameFromLibrary).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.handleRemoveFromLibrary("g1");
      });
      expect(api.games.removeGameFromLibrary).toHaveBeenCalledWith("g1");
      expect(refreshLibrary).toHaveBeenCalledTimes(1);
      expect(useLibraryStore.getState().selectedGame).toBeNull();
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("toggles favorite and propagates update to both store and status message", async () => {
    const refreshLibrary = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.games.setGameFavorite).mockResolvedValueOnce({
      ...sampleGame,
      is_favorite: true,
    });

    const { result } = renderHook(() =>
      useGameOperations({
        refreshLibrary,
        statusText,
        t,
      })
    );

    await act(async () => {
      await result.current.handleToggleFavorite(sampleGame);
    });

    expect(api.games.setGameFavorite).toHaveBeenCalledWith("g1", true);
    expect(useLibraryStore.getState().games[0].is_favorite).toBe(true);
    expect(useLibraryStore.getState().selectedGame?.is_favorite).toBe(true);
    expect(useUiStore.getState().statusMessage).toBe("game_updated");
  });
});
