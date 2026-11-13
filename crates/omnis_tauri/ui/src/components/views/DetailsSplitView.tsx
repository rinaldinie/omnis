import React from "react";
import { ActiveGameSession, GameDto, ThemeConfig, ViewMode } from "../../types";
import { DetailsSidebar } from "./details/DetailsSidebar";
import { DetailsHeroHeader } from "./details/DetailsHeroHeader";
import { DetailsMetadataPanel } from "./details/DetailsMetadataPanel";
import { ScrollArea } from "../ui/scroll-area";

interface DetailsSplitViewProps {
  currentTheme?: ThemeConfig;
  selectedGame: GameDto;
  setSelectedGame: (game: GameDto) => void;
  detailsSidebarOpen: boolean;
  setDetailsSidebarOpen: (open: boolean) => void;
  detailsSearchQuery: string;
  setDetailsSearchQuery: (query: string) => void;
  detailsFilteredGames: GameDto[];
  setViewMode: (mode: ViewMode) => void;
  handleOpenContextMenu: (e: React.MouseEvent, game: GameDto) => void;
  handleLaunch: (gameId: string) => void;
  handleEnrichSingleGame: (gameId: string) => void;
  handleRefreshHltb?: (gameId: string) => void;
  isEnrichingSingle: boolean;
  setGameToEdit: (game: GameDto) => void;
  setShowEditorModal: (show: boolean) => void;
  setGameToResolve: (game: GameDto) => void;
  setShowResolutionModal: (show: boolean) => void;
  t: (key: string, params?: Record<string, any>) => string;
  isGameRunning?: boolean;
  activeGame?: ActiveGameSession | null;
  elapsedSeconds?: number;
  formatDuration?: (seconds: number) => string;
  handleKillRunningGame?: () => void;
  activeFilter?: string;
  setActiveFilter?: (filter: string) => void;
  isFilterActive?: (filterId: string) => boolean;
  handleOpenInstallDir?: (gameId: string) => void;
  handleCreateShortcut?: (gameId: string) => void;
  handleVerifyFiles?: (gameId: string) => void;
  handleOpenUninstallModal?: (game: GameDto) => void;
  handleRemoveFromLibrary?: (gameId: string) => void;
  handlePromoteCopy?: (copyId: string) => void;
  handleToggleHidden?: (game: GameDto) => void;
  handleToggleFavorite?: (game: GameDto) => void;
}

export default function DetailsSplitView({
  currentTheme,
  selectedGame,
  setSelectedGame,
  detailsSidebarOpen,
  setDetailsSidebarOpen,
  detailsSearchQuery,
  setDetailsSearchQuery,
  detailsFilteredGames,
  setViewMode,
  handleOpenContextMenu,
  handleLaunch,
  handleEnrichSingleGame,
  handleRefreshHltb,
  isEnrichingSingle,
  setGameToEdit,
  setShowEditorModal,
  setGameToResolve,
  setShowResolutionModal,
  t,
  isGameRunning = false,
  activeGame,
  elapsedSeconds,
  formatDuration,
  handleKillRunningGame,
  activeFilter,
  setActiveFilter,
  isFilterActive,
  handleOpenInstallDir,
  handleCreateShortcut,
  handleVerifyFiles,
  handleOpenUninstallModal,
  handleRemoveFromLibrary,
  handlePromoteCopy,
  handleToggleHidden,
  handleToggleFavorite,
}: DetailsSplitViewProps) {
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Column: Titles Quick List (collapsible master panel) */}
      <DetailsSidebar
        detailsSidebarOpen={detailsSidebarOpen}
        setDetailsSidebarOpen={setDetailsSidebarOpen}
        detailsSearchQuery={detailsSearchQuery}
        setDetailsSearchQuery={setDetailsSearchQuery}
        detailsFilteredGames={detailsFilteredGames}
        selectedGame={selectedGame}
        setSelectedGame={setSelectedGame}
        handleOpenContextMenu={handleOpenContextMenu}
        activeGame={activeGame}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        isFilterActive={isFilterActive}
        t={t}
      />

      {/* Right Column: Expanded Hero Details Panel */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
        <DetailsHeroHeader
          currentTheme={currentTheme}
          selectedGame={selectedGame}
          setViewMode={setViewMode}
          handleLaunch={handleLaunch}
          handleEnrichSingleGame={handleEnrichSingleGame}
          isEnrichingSingle={isEnrichingSingle}
          setGameToEdit={setGameToEdit}
          setShowEditorModal={setShowEditorModal}
          setGameToResolve={setGameToResolve}
          setShowResolutionModal={setShowResolutionModal}
          t={t}
          isGameRunning={isGameRunning}
          activeGame={activeGame}
          elapsedSeconds={elapsedSeconds}
          formatDuration={formatDuration}
          handleKillRunningGame={handleKillRunningGame}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          isFilterActive={isFilterActive}
          handleOpenInstallDir={handleOpenInstallDir}
          handleCreateShortcut={handleCreateShortcut}
          handleVerifyFiles={handleVerifyFiles}
          handleOpenUninstallModal={handleOpenUninstallModal}
          handleRemoveFromLibrary={handleRemoveFromLibrary}
          handlePromoteCopy={handlePromoteCopy}
          handleToggleFavorite={handleToggleFavorite}
        />

        <DetailsMetadataPanel
          selectedGame={selectedGame}
          handleRefreshHltb={handleRefreshHltb}
          handleEnrichSingleGame={handleEnrichSingleGame}
          isEnrichingSingle={isEnrichingSingle}
          t={t}
          setGameToEdit={setGameToEdit}
          setShowEditorModal={setShowEditorModal}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          isFilterActive={isFilterActive}
          handleLaunch={handleLaunch}
          handlePromoteCopy={handlePromoteCopy}
        />
        </div>
      </ScrollArea>
    </div>
  );
}
