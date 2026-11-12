import { describe, it, expect, beforeEach } from "vitest";
import { useUiStore } from "./useUiStore";
import { GameDto } from "../types";

const mockGame: GameDto = {
  id: "test-game-1",
  title: "Test Cyberpunk",
  library: "steam",
  is_installed: true,
  playtime_seconds: 3600,
  playtime_formatted: "1h 0m",
  critic_score: 86,
  release_date: "2020-12-10",
  description: "Night city RPG",
  cover_image: null,
  background_image: null,
  genres: ["Action", "RPG"],
  developers: ["CD Projekt Red"],
  is_hidden: false,
  is_favorite: false,
};

describe("useUiStore", () => {
  beforeEach(() => {
    const store = useUiStore.getState();
    store.closeSettings();
    store.setShowOnboarding(false);
    store.closeGameEditor();
    store.closeResolutionModal();
    store.closeContextMenu();
    store.setViewMode("grid");
  });

  it("should open and close settings modal with initial tab", () => {
    const { openSettings, closeSettings } = useUiStore.getState();

    openSettings("metadata");
    expect(useUiStore.getState().showSettingsModal).toBe(true);
    expect(useUiStore.getState().settingsInitialTab).toBe("metadata");

    closeSettings();
    expect(useUiStore.getState().showSettingsModal).toBe(false);
  });

  it("should handle game editor modal open and close", () => {
    const { openGameEditor, closeGameEditor } = useUiStore.getState();

    openGameEditor(mockGame);
    expect(useUiStore.getState().showEditorModal).toBe(true);
    expect(useUiStore.getState().gameToEdit?.id).toBe("test-game-1");

    closeGameEditor();
    expect(useUiStore.getState().showEditorModal).toBe(false);
    expect(useUiStore.getState().gameToEdit).toBeNull();
  });

  it("should handle metadata resolution modal open and close", () => {
    const { openResolutionModal, closeResolutionModal } = useUiStore.getState();

    openResolutionModal(mockGame);
    expect(useUiStore.getState().showResolutionModal).toBe(true);
    expect(useUiStore.getState().gameToResolve?.id).toBe("test-game-1");

    closeResolutionModal();
    expect(useUiStore.getState().showResolutionModal).toBe(false);
    expect(useUiStore.getState().gameToResolve).toBeNull();
  });

  it("should handle context menu position and state", () => {
    const { setContextMenu, closeContextMenu } = useUiStore.getState();

    setContextMenu({ x: 150, y: 250, game: mockGame });
    expect(useUiStore.getState().contextMenu).toEqual({
      x: 150,
      y: 250,
      game: mockGame,
    });

    closeContextMenu();
    expect(useUiStore.getState().contextMenu).toBeNull();
  });

  it("should switch view modes correctly", () => {
    const { setViewMode } = useUiStore.getState();

    setViewMode("list");
    expect(useUiStore.getState().viewMode).toBe("list");

    setViewMode("details");
    expect(useUiStore.getState().viewMode).toBe("details");
  });

  it("should manage runtime sync status, status messages, and active game session", () => {
    const {
      setIsSyncing,
      setStatusMessage,
      setIsGameRunning,
      setActiveGame,
      openUninstallModal,
      closeUninstallModal,
    } = useUiStore.getState();

    setIsSyncing(true);
    setStatusMessage("Sincronizzazione in corso...");
    expect(useUiStore.getState().isSyncing).toBe(true);
    expect(useUiStore.getState().statusMessage).toBe("Sincronizzazione in corso...");

    setIsGameRunning(true);
    setActiveGame({
      session_id: "sess-1",
      game_id: mockGame.id,
      title: mockGame.title,
      state: "launching",
      started_at: "2026-01-01T00:00:00Z",
      process_detected_at: null,
    });
    expect(useUiStore.getState().isGameRunning).toBe(true);
    expect(useUiStore.getState().activeGame?.state).toBe("launching");

    setActiveGame((prev) => (prev ? { ...prev, state: "running", pid: 4321 } : null));
    expect(useUiStore.getState().activeGame?.state).toBe("running");
    expect(useUiStore.getState().activeGame?.pid).toBe(4321);

    openUninstallModal(mockGame);
    expect(useUiStore.getState().showUninstallModal).toBe(true);
    expect(useUiStore.getState().gameToUninstall?.id).toBe(mockGame.id);

    closeUninstallModal();
    expect(useUiStore.getState().showUninstallModal).toBe(false);
    expect(useUiStore.getState().gameToUninstall).toBeNull();
  });
});
