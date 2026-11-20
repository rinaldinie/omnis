import { describe, it, expect, beforeEach } from "vitest";
import { useModalStore } from "./useModalStore";
import { GameDto } from "../types";

const mockGame: GameDto = {
  id: "modal-test-game",
  title: "Test Elden Ring",
  library: "steam",
  is_installed: true,
  playtime_seconds: 7200,
  playtime_formatted: "2h 0m",
  genres: ["Action", "RPG"],
  developers: ["FromSoftware"],
  is_hidden: false,
  is_favorite: true,
  critic_score: 96,
  release_date: "2022-02-25",
  description: "A great game",
  cover_image: null,
  background_image: null,
};

describe("useModalStore", () => {
  beforeEach(() => {
    const store = useModalStore.getState();
    store.closeSettings();
    store.setShowOnboarding(false);
    store.closeGameEditor();
    store.closeResolutionModal();
    store.closeUninstallModal();
    store.setShowAddCustomModal(false);
    store.setShowVirtualKeyboard(false);
    store.setShowThemeModal(false);
    store.setShowPluginModal(false);
    store.setShowBatchEnrichModal(false);
    store.setIsPlayniteImportOpen(false);
    store.setShowKillConfirmModal(false);
  });

  it("should open and close settings modal with initial tab", () => {
    const { openSettings, closeSettings } = useModalStore.getState();

    openSettings("metadata");
    expect(useModalStore.getState().showSettingsModal).toBe(true);
    expect(useModalStore.getState().settingsInitialTab).toBe("metadata");

    closeSettings();
    expect(useModalStore.getState().showSettingsModal).toBe(false);
  });

  it("should open and close game editor modal with game target", () => {
    const { openGameEditor, closeGameEditor } = useModalStore.getState();

    openGameEditor(mockGame);
    expect(useModalStore.getState().showEditorModal).toBe(true);
    expect(useModalStore.getState().gameToEdit?.id).toBe("modal-test-game");

    closeGameEditor();
    expect(useModalStore.getState().showEditorModal).toBe(false);
    expect(useModalStore.getState().gameToEdit).toBeNull();
  });

  it("should open and close metadata resolution modal with game target", () => {
    const { openResolutionModal, closeResolutionModal } = useModalStore.getState();

    openResolutionModal(mockGame);
    expect(useModalStore.getState().showResolutionModal).toBe(true);
    expect(useModalStore.getState().gameToResolve?.id).toBe("modal-test-game");

    closeResolutionModal();
    expect(useModalStore.getState().showResolutionModal).toBe(false);
    expect(useModalStore.getState().gameToResolve).toBeNull();
  });

  it("should open and close uninstall modal with game target", () => {
    const { openUninstallModal, closeUninstallModal } = useModalStore.getState();

    openUninstallModal(mockGame);
    expect(useModalStore.getState().showUninstallModal).toBe(true);
    expect(useModalStore.getState().gameToUninstall?.id).toBe("modal-test-game");

    closeUninstallModal();
    expect(useModalStore.getState().showUninstallModal).toBe(false);
    expect(useModalStore.getState().gameToUninstall).toBeNull();
  });

  it("should toggle auxiliary modal flags independently", () => {
    const store = useModalStore.getState();

    store.setShowThemeModal(true);
    store.setShowPluginModal(true);
    store.setShowBatchEnrichModal(true);

    expect(useModalStore.getState().showThemeModal).toBe(true);
    expect(useModalStore.getState().showPluginModal).toBe(true);
    expect(useModalStore.getState().showBatchEnrichModal).toBe(true);

    store.setShowThemeModal(false);
    expect(useModalStore.getState().showThemeModal).toBe(false);
    expect(useModalStore.getState().showPluginModal).toBe(true);
  });
});
