import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppEvents } from "./useAppEvents";
import { api } from "../api";
import { listenTauri } from "../api/client";
import soundEffects from "../utils/soundEffects";
import { loadOnboardingState, shouldAutoScanOnStartup, shouldShowOnboarding } from "../components/modals/onboardingState";
import { useLibraryStore, useUiStore } from "../stores";
import { TAURI_EVENTS, type GameDto, type TranslateFn } from "../types";

const eventHandlers = new Map<string, (payload: unknown) => void>();
const unlistenSpies: Array<ReturnType<typeof vi.fn>> = [];

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    listenTauri: vi.fn(async (event: string, handler: (payload: unknown) => void) => {
      eventHandlers.set(event, handler);
      const unlisten = vi.fn();
      unlistenSpies.push(unlisten);
      return unlisten;
    }),
  };
});

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      games: {
        ...actual.api.games,
        getRunningGame: vi.fn().mockResolvedValue(null),
        setSyncAchievementsOnGameExit: vi.fn().mockResolvedValue(undefined),
        startLibraryAchievementSync: vi.fn().mockResolvedValue(undefined),
        syncLibrary: vi.fn().mockResolvedValue(0),
      },
      window: {
        ...actual.api.window,
        setMinimizeToTray: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
});

vi.mock("../utils/soundEffects", () => ({
  default: {
    setMuted: vi.fn(),
    suspendAudio: vi.fn(),
    resumeAudio: vi.fn(),
  },
}));

vi.mock("../components/modals/onboardingState", () => ({
  loadOnboardingState: vi.fn().mockResolvedValue(true),
  shouldAutoScanOnStartup: vi.fn().mockReturnValue(false),
  shouldShowOnboarding: vi.fn().mockReturnValue(false),
}));

vi.mock("../components/achievements", () => ({
  loadAchievementsConfig: vi.fn(() => ({
    syncOnGameExit: true,
    startupSyncInterval: "never",
    lastLibrarySyncTimestamp: 0,
  })),
  saveAchievementsConfig: vi.fn(),
}));

const statusText: TranslateFn = (key, params) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

const sampleGame: GameDto = {
  id: "g1",
  external_id: "100",
  title: "Hades",
  library: "steam",
  playtime_seconds: 1200,
  playtime_formatted: "20m",
  critic_score: null,
  release_date: null,
  description: null,
  cover_image: null,
  background_image: null,
  is_installed: true,
  is_favorite: false,
  is_hidden: false,
  genres: ["Action"],
  developers: ["Supergiant"],
  publishers: ["Supergiant"],
  features: [],
  custom_links: [],
};

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useAppEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers.clear();
    unlistenSpies.length = 0;
    useLibraryStore.setState({ games: [sampleGame] });
    useUiStore.setState({
      isSyncing: false,
      statusMessage: "",
      isGameRunning: false,
      activeGame: null,
      sessionToast: null,
      syncBanner: null,
      achievementSync: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads onboarding, triggers auto-scan when opted in, and unregisters listeners on unmount", async () => {
    vi.mocked(shouldAutoScanOnStartup).mockReturnValueOnce(true);
    vi.mocked(shouldShowOnboarding).mockReturnValueOnce(false);

    const loadGames = vi.fn().mockResolvedValue(undefined);
    const refreshLibrary = vi.fn().mockResolvedValue(undefined);
    const loadThemes = vi.fn().mockResolvedValue(undefined);
    const loadProvidersAndConfig = vi.fn().mockResolvedValue(undefined);

    const { unmount } = renderHook(() =>
      useAppEvents({
        loadGames,
        refreshLibrary,
        loadThemes,
        loadProvidersAndConfig,
        handleLaunch: vi.fn(),
        handleOpenSettings: vi.fn(),
        statusText,
        setPipelineProgress: vi.fn(),
      })
    );

    await flushAsync();

    expect(loadOnboardingState).toHaveBeenCalledTimes(1);
    expect(loadGames).toHaveBeenCalledTimes(1);
    expect(api.games.syncLibrary).toHaveBeenCalledTimes(1);
    expect(refreshLibrary).toHaveBeenCalledTimes(1);
    expect(listenTauri).toHaveBeenCalled();

    const registeredCount = unlistenSpies.length;
    expect(registeredCount).toBeGreaterThanOrEqual(8);

    unmount();
    unlistenSpies.forEach((fn) => expect(fn).toHaveBeenCalledTimes(1));
  });

  it("handles game session lifecycle events and ignores mismatched session_id stops", async () => {
    const loadGames = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useAppEvents({
        loadGames,
        refreshLibrary: vi.fn().mockResolvedValue(undefined),
        loadThemes: vi.fn().mockResolvedValue(undefined),
        loadProvidersAndConfig: vi.fn().mockResolvedValue(undefined),
        handleLaunch: vi.fn(),
        handleOpenSettings: vi.fn(),
        statusText,
        setPipelineProgress: vi.fn(),
      })
    );

    await flushAsync();
    loadGames.mockClear();

    act(() => {
      eventHandlers.get(TAURI_EVENTS.GAME_STARTED)?.({
        session_id: "sess-1",
        game_id: "g1",
        title: "Hades",
        state: "launching",
        started_at: "2026-01-01T10:00:00Z",
      });
    });

    expect(useUiStore.getState().isGameRunning).toBe(true);
    expect(useUiStore.getState().activeGame?.session_id).toBe("sess-1");
    expect(soundEffects.suspendAudio).toHaveBeenCalledTimes(1);

    act(() => {
      eventHandlers.get(TAURI_EVENTS.GAME_STATUS_CHANGED)?.({
        session_id: "sess-1",
        game_id: "g1",
        state: "running",
        pid: 4321,
      });
    });

    expect(useUiStore.getState().activeGame?.state).toBe("running");
    expect(useUiStore.getState().activeGame?.pid).toBe(4321);

    // Mismatched session stop event must not terminate the active session
    act(() => {
      eventHandlers.get(TAURI_EVENTS.GAME_STOPPED)?.({
        session_id: "other-session",
        game_id: "g1",
        duration_seconds: 60,
      });
    });
    expect(useUiStore.getState().isGameRunning).toBe(true);

    act(() => {
      eventHandlers.get(TAURI_EVENTS.GAME_STOPPED)?.({
        session_id: "sess-1",
        game_id: "g1",
        duration_seconds: 180,
      });
    });

    expect(useUiStore.getState().isGameRunning).toBe(false);
    expect(useUiStore.getState().activeGame).toBeNull();
    expect(soundEffects.resumeAudio).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().sessionToast).toEqual({
      title: "Hades",
      durationSeconds: 180,
      gameId: "g1",
    });
    expect(loadGames).toHaveBeenCalledTimes(1);
  });

  it("handles store sync progress transitions and tray shortcuts", async () => {
    const handleLaunch = vi.fn();
    const handleOpenSettings = vi.fn();
    const loadGames = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useAppEvents({
        loadGames,
        refreshLibrary: vi.fn().mockResolvedValue(undefined),
        loadThemes: vi.fn().mockResolvedValue(undefined),
        loadProvidersAndConfig: vi.fn().mockResolvedValue(undefined),
        handleLaunch,
        handleOpenSettings,
        statusText,
        setPipelineProgress: vi.fn(),
      })
    );

    await flushAsync();
    loadGames.mockClear();

    act(() => {
      eventHandlers.get(TAURI_EVENTS.STORE_SYNC_PROGRESS)?.({
        store_id: "gog",
        current: 2,
        total: 5,
        status: "syncing",
      });
    });

    expect(useUiStore.getState().isSyncing).toBe(true);
    expect(useUiStore.getState().syncBanner).toMatchObject({
      storeId: "gog",
      storeName: "GOG Galaxy",
      status: "syncing",
    });

    act(() => {
      eventHandlers.get(TAURI_EVENTS.STORE_SYNC_PROGRESS)?.({
        store_id: "gog",
        current: 5,
        total: 5,
        status: "completed",
      });
    });

    expect(useUiStore.getState().isSyncing).toBe(false);
    expect(useUiStore.getState().syncBanner?.status).toBe("completed");
    expect(loadGames).toHaveBeenCalledTimes(1);

    act(() => {
      eventHandlers.get(TAURI_EVENTS.TRAY_LAUNCH_GAME)?.("g1");
      eventHandlers.get(TAURI_EVENTS.TRAY_OPEN_SETTINGS)?.({});
    });

    expect(handleLaunch).toHaveBeenCalledWith("g1");
    expect(handleOpenSettings).toHaveBeenCalledWith("general");
  });
});
