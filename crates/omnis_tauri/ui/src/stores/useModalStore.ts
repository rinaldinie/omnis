import { create } from "zustand";
import { GameDto } from "../types";
import type { SettingsTab } from "../components/settings";

export interface ModalState {
  // Modals visibility
  showSettingsModal: boolean;
  settingsInitialTab: SettingsTab;
  showOnboarding: boolean;
  showEditorModal: boolean;
  showResolutionModal: boolean;
  showAddCustomModal: boolean;
  showVirtualKeyboard: boolean;
  showThemeModal: boolean;
  showPluginModal: boolean;
  showBatchEnrichModal: boolean;
  isPlayniteImportOpen: boolean;
  showKillConfirmModal: boolean;
  showUninstallModal: boolean;

  // Modal payload targets
  gameToEdit: GameDto | null;
  gameToResolve: GameDto | null;
  gameToUninstall: GameDto | null;

  // Actions
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setShowSettingsModal: (show: boolean) => void;
  setShowOnboarding: (show: boolean) => void;
  setShowEditorModal: (show: boolean) => void;
  setGameToEdit: (game: GameDto | null) => void;
  openGameEditor: (game: GameDto) => void;
  closeGameEditor: () => void;
  setShowResolutionModal: (show: boolean) => void;
  setGameToResolve: (game: GameDto | null) => void;
  openResolutionModal: (game: GameDto) => void;
  closeResolutionModal: () => void;
  setShowAddCustomModal: (show: boolean) => void;
  setShowVirtualKeyboard: (show: boolean) => void;
  setShowThemeModal: (show: boolean) => void;
  setShowPluginModal: (show: boolean) => void;
  setShowBatchEnrichModal: (show: boolean) => void;
  setIsPlayniteImportOpen: (open: boolean) => void;
  setShowKillConfirmModal: (show: boolean) => void;
  setShowUninstallModal: (show: boolean) => void;
  setGameToUninstall: (game: GameDto | null) => void;
  openUninstallModal: (game: GameDto) => void;
  closeUninstallModal: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  showSettingsModal: false,
  settingsInitialTab: "general",
  showOnboarding: false,
  showEditorModal: false,
  showResolutionModal: false,
  showAddCustomModal: false,
  showVirtualKeyboard: false,
  showThemeModal: false,
  showPluginModal: false,
  showBatchEnrichModal: false,
  isPlayniteImportOpen: false,
  showKillConfirmModal: false,
  showUninstallModal: false,

  gameToEdit: null,
  gameToResolve: null,
  gameToUninstall: null,

  openSettings: (tab = "general") =>
    set({ showSettingsModal: true, settingsInitialTab: tab }),
  closeSettings: () => set({ showSettingsModal: false }),
  setShowSettingsModal: (showSettingsModal) =>
    set((state) => ({
      showSettingsModal,
      settingsInitialTab: showSettingsModal ? state.settingsInitialTab : "general",
    })),

  setShowOnboarding: (showOnboarding) => set({ showOnboarding }),

  setShowEditorModal: (showEditorModal) => set({ showEditorModal }),
  setGameToEdit: (gameToEdit) => set({ gameToEdit }),
  openGameEditor: (game) =>
    set({ showEditorModal: true, gameToEdit: game }),
  closeGameEditor: () =>
    set({ showEditorModal: false, gameToEdit: null }),

  setShowResolutionModal: (showResolutionModal) => set({ showResolutionModal }),
  setGameToResolve: (gameToResolve) => set({ gameToResolve }),
  openResolutionModal: (game) =>
    set({ showResolutionModal: true, gameToResolve: game }),
  closeResolutionModal: () =>
    set({ showResolutionModal: false, gameToResolve: null }),

  setShowAddCustomModal: (showAddCustomModal) => set({ showAddCustomModal }),
  setShowVirtualKeyboard: (showVirtualKeyboard) => set({ showVirtualKeyboard }),
  setShowThemeModal: (showThemeModal) => set({ showThemeModal }),
  setShowPluginModal: (showPluginModal) => set({ showPluginModal }),
  setShowBatchEnrichModal: (showBatchEnrichModal) => set({ showBatchEnrichModal }),
  setIsPlayniteImportOpen: (isPlayniteImportOpen) => set({ isPlayniteImportOpen }),
  setShowKillConfirmModal: (showKillConfirmModal) => set({ showKillConfirmModal }),
  setShowUninstallModal: (showUninstallModal) => set({ showUninstallModal }),
  setGameToUninstall: (gameToUninstall) => set({ gameToUninstall }),
  openUninstallModal: (game) =>
    set({ showUninstallModal: true, gameToUninstall: game }),
  closeUninstallModal: () =>
    set({ showUninstallModal: false, gameToUninstall: null }),
}));
