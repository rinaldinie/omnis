import { create } from "zustand";
import { ViewMode, GameDto } from "../types";
import { SettingsTab } from "../components/settings";
import soundEffects from "../utils/soundEffects";

export interface ContextMenuState {
  x: number;
  y: number;
  game: GameDto;
}

export interface UiState {
  // Views
  viewMode: ViewMode;
  isFullscreen: boolean;
  soundEnabled: boolean;

  // Modals visibility
  showSettingsModal: boolean;
  settingsInitialTab: SettingsTab;
  showOnboarding: boolean;
  showEditorModal: boolean;
  showResolutionModal: boolean;
  showAddCustomModal: boolean;
  showVirtualKeyboard: boolean;

  // Modal payload targets
  gameToEdit: GameDto | null;
  gameToResolve: GameDto | null;

  // Context Menu
  contextMenu: ContextMenuState | null;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setIsFullscreen: (isFullscreen: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setShowOnboarding: (show: boolean) => void;
  openGameEditor: (game: GameDto) => void;
  closeGameEditor: () => void;
  openResolutionModal: (game: GameDto) => void;
  closeResolutionModal: () => void;
  setShowAddCustomModal: (show: boolean) => void;
  setShowVirtualKeyboard: (show: boolean) => void;
  setContextMenu: (menu: ContextMenuState | null) => void;
  closeContextMenu: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  viewMode: "grid",
  isFullscreen:
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("fullscreen") === "true" ||
        new URLSearchParams(window.location.search).has("fullscreen") ||
        window.location.hash.includes("fullscreen")
      : false,
  soundEnabled: soundEffects.enabled,

  showSettingsModal: false,
  settingsInitialTab: "general",
  showOnboarding: false,
  showEditorModal: false,
  showResolutionModal: false,
  showAddCustomModal: false,
  showVirtualKeyboard: false,

  gameToEdit: null,
  gameToResolve: null,
  contextMenu: null,

  setViewMode: (viewMode) => set({ viewMode }),
  setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
  setSoundEnabled: (soundEnabled) => {
    soundEffects.enabled = soundEnabled;
    set({ soundEnabled });
  },

  openSettings: (tab = "general") =>
    set({ showSettingsModal: true, settingsInitialTab: tab }),
  closeSettings: () => set({ showSettingsModal: false }),

  setShowOnboarding: (showOnboarding) => set({ showOnboarding }),

  openGameEditor: (game) =>
    set({ showEditorModal: true, gameToEdit: game }),
  closeGameEditor: () =>
    set({ showEditorModal: false, gameToEdit: null }),

  openResolutionModal: (game) =>
    set({ showResolutionModal: true, gameToResolve: game }),
  closeResolutionModal: () =>
    set({ showResolutionModal: false, gameToResolve: null }),

  setShowAddCustomModal: (showAddCustomModal) => set({ showAddCustomModal }),
  setShowVirtualKeyboard: (showVirtualKeyboard) => set({ showVirtualKeyboard }),

  setContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
}));
