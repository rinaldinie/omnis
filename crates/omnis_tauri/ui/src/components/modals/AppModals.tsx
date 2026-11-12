import React from "react";
import {
  GameDto,
  ThemeConfig,
  normalizeGame,
} from "../../types";
import { useLibraryStore, useUiStore, ContextMenuState } from "../../stores";
import ThemeModal from "./ThemeModal";
import PluginManagerModal from "./PluginManagerModal";
import GlobalContextMenu from "../GlobalContextMenu";
import GameEditorModal from "./GameEditorModal";
import MetadataResolutionModal from "./MetadataResolutionModal";
import BatchEnrichModal from "./BatchEnrichModal";
import VirtualKeyboard from "../VirtualKeyboard";
import CustomGameModal from "./CustomGameModal";
import { UninstallModal } from "./UninstallModal";
import { SettingsModal } from "../settings";
import PlayniteImportModal from "./PlayniteImportModal";
import { KillGameConfirmModal } from "./KillGameConfirmModal";
import type { usePluginManager } from "../../hooks/usePluginManager";

export type { ContextMenuState };

export interface AppModalsProps {
  // Theme Modal
  themes: ThemeConfig[];
  currentTheme: ThemeConfig;
  selectTheme: (theme: ThemeConfig) => void;
  handleSaveCustomTheme: (theme: ThemeConfig) => Promise<void>;
  handleOpenFolder: (folder: string) => void;

  // Plugin Manager Modal
  pluginManager: ReturnType<typeof usePluginManager>;

  // Context Menu & Game Actions
  handleLaunch: (gameId: string) => void;
  handleUpdateCompletionStatus: (game: GameDto, status: string) => void;
  handleOpenInstallDir: (gameId: string) => void;
  handleCreateShortcut: (gameId: string) => void;
  handleVerifyFiles: (gameId: string) => void;
  handleOpenUninstallModal: (game: GameDto) => void;
  handleRemoveFromLibrary: (gameId: string) => void;
  onToggleHidden?: (game: GameDto) => void;
  onToggleFavorite?: (game: GameDto) => void;
  onPromoteCopy?: (copyId: string) => void;

  // Editor & Resolution Modals
  statusText: (key: string, params?: Record<string, any>) => string;

  // Batch Enrich Modal
  filteredGames: GameDto[];

  // Virtual Keyboard
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setFocusedIndex: (index: number) => void;
  fullscreenGamesCount: number;

  // Uninstall Modal
  handleConfirmUninstall: (gameId: string) => Promise<void>;

  // Settings Modal
  handleToggleSound: () => void;

  // Kill Confirm Modal
  confirmKillRunningGame: () => void;

  // Translation
  t: (key: string, params?: Record<string, any>) => string;
}

export const AppModals: React.FC<AppModalsProps> = ({
  themes,
  currentTheme,
  selectTheme,
  handleSaveCustomTheme,
  handleOpenFolder,

  pluginManager,

  handleLaunch,
  handleUpdateCompletionStatus,
  handleOpenInstallDir,
  handleCreateShortcut,
  handleVerifyFiles,
  handleOpenUninstallModal,
  handleRemoveFromLibrary,
  onToggleHidden,
  onToggleFavorite,
  onPromoteCopy,

  statusText,

  filteredGames,

  searchQuery,
  setSearchQuery,
  setFocusedIndex,
  fullscreenGamesCount,

  handleConfirmUninstall,

  handleToggleSound,

  confirmKillRunningGame,

  t,
}) => {
  const {
    games,
    setGames,
    selectedGame,
    setSelectedGame,
    refreshLibrary,
  } = useLibraryStore();

  const {
    setViewMode,
    soundEnabled,
    showThemeModal,
    setShowThemeModal,
    showPluginModal,
    setShowPluginModal,
    contextMenu,
    setContextMenu,
    showEditorModal,
    setShowEditorModal,
    gameToEdit,
    setGameToEdit,
    showResolutionModal,
    setShowResolutionModal,
    gameToResolve,
    setGameToResolve,
    showBatchEnrichModal,
    setShowBatchEnrichModal,
    showVirtualKeyboard,
    setShowVirtualKeyboard,
    showAddCustomModal,
    setShowAddCustomModal,
    showUninstallModal,
    setShowUninstallModal,
    gameToUninstall,
    setGameToUninstall,
    showSettingsModal,
    setShowSettingsModal,
    settingsInitialTab,
    isPlayniteImportOpen,
    setIsPlayniteImportOpen,
    showKillConfirmModal,
    setShowKillConfirmModal,
    activeGame,
    setStatusMessage,
  } = useUiStore();
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
