import { describe, it, expect, beforeEach } from "vitest";
import { useUiStore } from "./useUiStore";
import { GameDto } from "../types";

const mockGame: GameDto = {
  id: "test-game-1",
  title: "Test Cyberpunk",
  sort_title: "Test Cyberpunk",
  store: "steam",
  store_id: "1091500",
  install_path: "/games/cyberpunk",
  is_installed: true,
  is_hidden: false,
  is_favorite: false,
  genres: ["Action", "RPG"],
  tags: [],
  features: ["Singleplayer"],
  playtime_seconds: 3600,
  last_played: 1600000000,
  duplicate_group_id: null,
  other_copies: [],
  completion_status: "playing",
  notes: "",
  user_rating: 9,
  critic_score: 86,
  release_date: "2020-12-10",
  developer: "CD Projekt",
  publisher: "CD Projekt",
  hltb: null,
  images: {
    cover: null,
    background: null,
    banner: null,
    logo: null,
    icon: null,
  },
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
});
