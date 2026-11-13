import { create } from "zustand";
import {
  ViewMode,
  GameDto,
  ActiveGameSession,
  AchievementSyncProgress,
} from "../types";
import type { SettingsTab } from "../components/settings";
import type { SessionToastInfo, SyncBannerInfo } from "../components/common/AppToasts";
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

  // Context Menu
  contextMenu: ContextMenuState | null;

  // Runtime status & active session / sync state
  isSyncing: boolean;
  statusMessage: string;
  isGameRunning: boolean;
  activeGame: ActiveGameSession | null;
  sessionToast: SessionToastInfo | null;
  syncBanner: SyncBannerInfo | null;
  achievementSync: AchievementSyncProgress | null;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setIsFullscreen: (isFullscreen: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
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
  setContextMenu: (menu: ContextMenuState | null) => void;
  closeContextMenu: () => void;
  setIsSyncing: (isSyncing: boolean) => void;
  setStatusMessage: (statusMessage: string) => void;
  setIsGameRunning: (isGameRunning: boolean) => void;
  setActiveGame: (
    updater:
      | ActiveGameSession
      | null
      | ((prev: ActiveGameSession | null) => ActiveGameSession | null)
  ) => void;
  setSessionToast: (toast: SessionToastInfo | null) => void;
  setSyncBanner: (banner: SyncBannerInfo | null) => void;
  setAchievementSync: (
    updater:
      | AchievementSyncProgress
      | null
      | ((prev: AchievementSyncProgress | null) => AchievementSyncProgress | null)
  ) => void;
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
  showThemeModal: false,
  showPluginModal: false,
  showBatchEnrichModal: false,
  isPlayniteImportOpen: false,
  showKillConfirmModal: false,
  showUninstallModal: false,

  gameToEdit: null,
  gameToResolve: null,
  gameToUninstall: null,
  contextMenu: null,

  isSyncing: false,
  statusMessage: "",
  isGameRunning: false,
  activeGame: null,
  sessionToast: null,
  syncBanner: null,
  achievementSync: null,

  setViewMode: (viewMode) => set({ viewMode }),
  setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
  setSoundEnabled: (soundEnabled) => {
    soundEffects.enabled = soundEnabled;
    set({ soundEnabled });
  },

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

  setContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),

  setIsSyncing: (isSyncing) => set({ isSyncing }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
  setIsGameRunning: (isGameRunning) => set({ isGameRunning }),
  setActiveGame: (updater) =>
    set((state) => ({
      activeGame: typeof updater === "function" ? updater(state.activeGame) : updater,
    })),
  setSessionToast: (sessionToast) => set({ sessionToast }),
  setSyncBanner: (syncBanner) => set({ syncBanner }),
  setAchievementSync: (updater) =>
    set((state) => ({
      achievementSync:
        typeof updater === "function" ? updater(state.achievementSync) : updater,
    })),
}));
