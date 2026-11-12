import React from "react";
import {
  GameDto,
  ThemeConfig,
  ViewMode,
  ActiveGameSession,
  normalizeGame,
} from "../../types";
import ThemeModal from "./ThemeModal";
import PluginManagerModal from "./PluginManagerModal";
import GlobalContextMenu from "../GlobalContextMenu";
import GameEditorModal from "./GameEditorModal";
import MetadataResolutionModal from "./MetadataResolutionModal";
import BatchEnrichModal from "./BatchEnrichModal";
import VirtualKeyboard from "../VirtualKeyboard";
import CustomGameModal from "./CustomGameModal";
import { UninstallModal } from "./UninstallModal";
import { SettingsModal, SettingsTab } from "../settings";
import PlayniteImportModal from "./PlayniteImportModal";
import { KillGameConfirmModal } from "./KillGameConfirmModal";
import type { usePluginManager } from "../../hooks/usePluginManager";

export interface ContextMenuState {
  x: number;
  y: number;
  game: GameDto;
}

export interface AppModalsProps {
  // Theme Modal
  showThemeModal: boolean;
  setShowThemeModal: (open: boolean) => void;
  themes: ThemeConfig[];
  currentTheme: ThemeConfig;
  selectTheme: (theme: ThemeConfig) => void;
  handleSaveCustomTheme: (theme: ThemeConfig) => Promise<void>;
  handleOpenFolder: (folder: string) => void;

  // Plugin Manager Modal
  showPluginModal: boolean;
  setShowPluginModal: (open: boolean) => void;
  pluginManager: ReturnType<typeof usePluginManager>;
  games: GameDto[];
  refreshLibrary: () => Promise<void>;

  // Context Menu
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;
  handleLaunch: (gameId: string) => void;
  setGameToEdit: (game: GameDto | null) => void;
  setShowEditorModal: (open: boolean) => void;
  setGameToResolve: (game: GameDto | null) => void;
  setShowResolutionModal: (open: boolean) => void;
  setSelectedGame: React.Dispatch<React.SetStateAction<GameDto | null>>;
  setViewMode: (mode: ViewMode) => void;
  handleUpdateCompletionStatus: (game: GameDto, status: string) => void;
  handleOpenInstallDir: (gameId: string) => void;
  handleCreateShortcut: (gameId: string) => void;
  handleVerifyFiles: (gameId: string) => void;
  handleOpenUninstallModal: (game: GameDto) => void;
  handleRemoveFromLibrary: (gameId: string) => void;
  onToggleHidden?: (game: GameDto) => void;
  onToggleFavorite?: (game: GameDto) => void;
  onPromoteCopy?: (copyId: string) => void;

  // Editor Modal
  showEditorModal: boolean;
  gameToEdit: GameDto | null;
  selectedGame: GameDto | null;
  setGames: React.Dispatch<React.SetStateAction<GameDto[]>>;
  setStatusMessage: (msg: string) => void;
  statusText: (key: string, params?: Record<string, any>) => string;

  // Metadata Resolution Modal
  showResolutionModal: boolean;
  gameToResolve: GameDto | null;

  // Batch Enrich Modal
  showBatchEnrichModal: boolean;
  setShowBatchEnrichModal: (open: boolean) => void;
  filteredGames: GameDto[];

  // Virtual Keyboard
  showVirtualKeyboard: boolean;
  setShowVirtualKeyboard: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setFocusedIndex: (index: number) => void;
  fullscreenGamesCount: number;

  // Custom Game Modal
  showAddCustomModal: boolean;
  setShowAddCustomModal: (open: boolean) => void;

  // Uninstall Modal
  showUninstallModal: boolean;
  setShowUninstallModal: (open: boolean) => void;
  gameToUninstall: GameDto | null;
  setGameToUninstall: (game: GameDto | null) => void;
  handleConfirmUninstall: (gameId: string) => Promise<void>;

  // Settings Modal
  showSettingsModal: boolean;
  setShowSettingsModal: (open: boolean) => void;
  soundEnabled: boolean;
  handleToggleSound: () => void;
  settingsInitialTab: SettingsTab;

  // Playnite Import Modal
  isPlayniteImportOpen: boolean;
  setIsPlayniteImportOpen: (open: boolean) => void;

  // Kill Confirm Modal
  showKillConfirmModal: boolean;
  setShowKillConfirmModal: (open: boolean) => void;
  activeGame: ActiveGameSession | null;
  confirmKillRunningGame: () => void;

  // Translation
  t: (key: string, params?: Record<string, any>) => string;
}

export const AppModals: React.FC<AppModalsProps> = ({
  showThemeModal,
  setShowThemeModal,
  themes,
  currentTheme,
  selectTheme,
  handleSaveCustomTheme,
  handleOpenFolder,

  showPluginModal,
  setShowPluginModal,
  pluginManager,
  games,
  refreshLibrary,

  contextMenu,
  setContextMenu,
  handleLaunch,
  setGameToEdit,
  setShowEditorModal,
  setGameToResolve,
  setShowResolutionModal,
  setSelectedGame,
  setViewMode,
  handleUpdateCompletionStatus,
  handleOpenInstallDir,
  handleCreateShortcut,
  handleVerifyFiles,
  handleOpenUninstallModal,
  handleRemoveFromLibrary,
  onToggleHidden,
  onToggleFavorite,
  onPromoteCopy,

  showEditorModal,
  gameToEdit,
  selectedGame,
  setGames,
  setStatusMessage,
  statusText,

  showResolutionModal,
  gameToResolve,

  showBatchEnrichModal,
  setShowBatchEnrichModal,
  filteredGames,

  showVirtualKeyboard,
  setShowVirtualKeyboard,
  searchQuery,
  setSearchQuery,
  setFocusedIndex,
  fullscreenGamesCount,

  showAddCustomModal,
  setShowAddCustomModal,

  showUninstallModal,
  setShowUninstallModal,
  gameToUninstall,
  setGameToUninstall,
  handleConfirmUninstall,

  showSettingsModal,
  setShowSettingsModal,
  soundEnabled,
  handleToggleSound,
  settingsInitialTab,

  isPlayniteImportOpen,
  setIsPlayniteImportOpen,

  showKillConfirmModal,
  setShowKillConfirmModal,
  activeGame,
  confirmKillRunningGame,

  t,
}) => {
  return (
    <>
      {/* THEME MANAGER MODAL */}
      <ThemeModal
        isOpen={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        themes={themes}
        currentTheme={currentTheme}
        onSelectTheme={selectTheme}
        onSaveCustomTheme={handleSaveCustomTheme}
        onOpenThemesFolder={() => handleOpenFolder("themes")}
      />

      {/* METADATA PLUGIN & PIPELINE MODAL */}
      <PluginManagerModal
        isOpen={showPluginModal}
        onClose={() => setShowPluginModal(false)}
        providers={pluginManager.providers}
        pipelineConfig={pluginManager.pipelineConfig}
        setPipelineConfig={pluginManager.setPipelineConfig}
        editingSettings={pluginManager.editingSettings}
        setEditingSettings={pluginManager.setEditingSettings}
        showApiKey={pluginManager.showApiKey}
        setShowApiKey={pluginManager.setShowApiKey}
        testStatus={pluginManager.testStatus}
        isRefreshingPlugins={pluginManager.isRefreshingPlugins}
        handleRefreshPlugins={pluginManager.handleRefreshPlugins}
        handleOpenFolder={handleOpenFolder}
        handleToggleProvider={pluginManager.handleToggleProvider}
        handleTestConnection={pluginManager.handleTestConnection}
        handleSaveProviderSettings={pluginManager.handleSaveProviderSettings}
        handleSavePipelineConfig={pluginManager.handleSavePipelineConfig}
        gamesCount={games.length}
        gamesWithCoverCount={games.filter((g) => g.cover_image).length}
        gamesWithScoreCount={games.filter((g) => g.critic_score).length}
        pipelineProgress={pluginManager.pipelineProgress}
        isPipelineEnriching={pluginManager.isPipelineEnriching}
        handleRunMassivePipeline={pluginManager.handleRunMassivePipeline}
        handleCancelPipeline={pluginManager.handleCancelPipeline}
        onPluginInstalled={() => pluginManager.loadProvidersAndConfig()}
      />

      {/* GLOBAL RIGHT-CLICK CONTEXT MENU */}
      <GlobalContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        onLaunch={handleLaunch}
        onEdit={(game: GameDto) => {
          setGameToEdit(game);
          setShowEditorModal(true);
        }}
        onResolve={(game: GameDto) => {
          setGameToResolve(game);
          setShowResolutionModal(true);
        }}
        onShowDetails={(game: GameDto) => {
          setSelectedGame(game);
          setViewMode("details");
        }}
        onUpdateCompletionStatus={handleUpdateCompletionStatus}
        onOpenFolder={(game: GameDto) => handleOpenInstallDir(game.id)}
        onCreateShortcut={(game: GameDto) => handleCreateShortcut(game.id)}
        onVerifyFiles={(game: GameDto) => handleVerifyFiles(game.id)}
        onUninstall={handleOpenUninstallModal}
        onRemoveFromLibrary={(game: GameDto) => handleRemoveFromLibrary(game.id)}
        onToggleHidden={onToggleHidden}
        onToggleFavorite={onToggleFavorite}
        onPromoteCopy={onPromoteCopy}
      />

      {/* METADATA EDITOR MODAL */}
      {(gameToEdit || selectedGame) && (
        <GameEditorModal
          isOpen={showEditorModal}
          onClose={() => {
            setShowEditorModal(false);
            setGameToEdit(null);
          }}
          game={(gameToEdit || selectedGame)!}
          onSave={(updated) => {
            const normalized = normalizeGame(updated);
            if (selectedGame && selectedGame.id === normalized.id) {
              setSelectedGame(normalized);
            }
            setGames((prev) => prev.map((g) => (g.id === normalized.id ? normalized : g)));
            setStatusMessage(statusText("edits_saved", { title: normalized.title }));
            setShowEditorModal(false);
            setGameToEdit(null);
          }}
        />
      )}

      {/* METADATA RESOLUTION MODAL */}
      {gameToResolve && (
        <MetadataResolutionModal
          isOpen={showResolutionModal}
          onClose={() => {
            setShowResolutionModal(false);
            setGameToResolve(null);
          }}
          game={gameToResolve}
          onApply={(updated) => {
            const normalized = normalizeGame(updated);
            if (selectedGame && selectedGame.id === normalized.id) {
              setSelectedGame(normalized);
            }
            setGames((prev) => prev.map((g) => (g.id === normalized.id ? normalized : g)));
            setStatusMessage(statusText("metadata_updated_game", { title: normalized.title }));
            setShowResolutionModal(false);
            setGameToResolve(null);
          }}
        />
      )}

      {/* BATCH METADATA ENRICHMENT MODAL */}
      <BatchEnrichModal
        isOpen={showBatchEnrichModal}
        onClose={() => setShowBatchEnrichModal(false)}
        allGames={games}
        filteredGames={filteredGames}
        onComplete={refreshLibrary}
      />

      {/* FULLSCREEN VIRTUAL KEYBOARD */}
      <VirtualKeyboard
        isOpen={showVirtualKeyboard}
        value={searchQuery}
        onChange={(val: string) => {
          setSearchQuery(val);
          setFocusedIndex(0);
        }}
        onSubmit={() => {
          setShowVirtualKeyboard(false);
        }}
        onClose={() => {
          setShowVirtualKeyboard(false);
        }}
        placeholder={t("console_ui.search_library")}
        resultCount={fullscreenGamesCount}
      />

      {/* CUSTOM GAME IMPORT MODAL */}
      <CustomGameModal
        isOpen={showAddCustomModal}
        onClose={() => setShowAddCustomModal(false)}
        onSuccess={(title) => {
          refreshLibrary();
          setShowAddCustomModal(false);
          setStatusMessage(statusText("custom_game_added", { title }));
        }}
      />

      {/* UNINSTALL CONFIRMATION MODAL */}
      <UninstallModal
        isOpen={showUninstallModal}
        game={gameToUninstall}
        onClose={() => {
          setShowUninstallModal(false);
          setGameToUninstall(null);
        }}
        onConfirmUninstall={handleConfirmUninstall}
      />

      {/* SETTINGS & OPTIONS MODAL */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenThemes={() => setShowThemeModal(true)}
        currentThemeName={currentTheme.name}
        initialTab={settingsInitialTab}
        onSyncComplete={refreshLibrary}
        onOpenPlayniteImport={() => setIsPlayniteImportOpen(true)}
      />

      {/* PLAYNITE BACKUP IMPORT MODAL */}
      <PlayniteImportModal
        isOpen={isPlayniteImportOpen}
        onClose={() => setIsPlayniteImportOpen(false)}
        onSuccess={() => {
          refreshLibrary();
        }}
      />

      {/* KILL RUNNING GAME CONFIRMATION MODAL */}
      <KillGameConfirmModal
        isOpen={showKillConfirmModal}
        activeGame={activeGame}
        onClose={() => setShowKillConfirmModal(false)}
        onConfirm={confirmKillRunningGame}
        t={t}
      />
    </>
  );
};
