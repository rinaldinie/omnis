import React, { useState, lazy, Suspense } from "react";
import {
  GameDto,
  GroupBy,
  ProviderInfo,
  ThemeConfig,
  TranslateFn,
} from "../../types";
import type { GameSortMode } from "../../utils/sortGames";
import type { FilterCounts } from "../navigation/FilterAndSortPopover";
import type { FilterChip } from "../../hooks/useLibraryFilters";
import { useLibraryStore, useUiStore } from "../../stores";
import TopBar from "../navigation/TopBar";
import Sidebar from "../navigation/Sidebar";
import VideoBackdrop from "../common/VideoBackdrop";
import { CatalogToolbar } from "../navigation/CatalogToolbar";
import GridView from "./GridView";
import EmptyGamesView from "../common/EmptyGamesView";
import { ErrorBoundary } from "../common/ErrorBoundary";
import { StatusBar } from "../navigation/StatusBar";
import { TooltipProvider } from "@/components/ui/tooltip";

const DetailsSplitView = lazy(() => import("./DetailsSplitView"));
const ListViewTable = lazy(() => import("../ListViewTable"));
const StatisticsDashboardView = lazy(() => import("./StatisticsDashboardView"));

export interface DesktopViewProps {
  currentTheme: ThemeConfig;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  toggleFullscreen: () => void;
  handleToggleSound: () => void;
  loadProvidersAndConfig: () => void;
  providers: ProviderInfo[];
  handleSync: () => void;
  handleMinimize: () => void;
  handleToggleMaximize: () => void;
  handleClose: () => void;
  handleStartDragging: (e: React.MouseEvent) => void;
  t: TranslateFn;
  formatDuration: (s: number) => string;
  handleKillRunningGame: () => void;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  isFilterActive: (filter: string) => boolean;
  gamepadConnected: boolean;
  gamepadName: string;
  handleOpenFolder: (folder: string) => void;
  sortMode: GameSortMode;
  setSortMode: (mode: GameSortMode) => void;
  selectedFlags: string[];
  toggleFlag: (flag: string) => void;
  selectedStatuses: string[];
  toggleStatus: (status: string) => void;
  selectedStores: string[];
  toggleStore: (store: string) => void;
  selectedGenres: string[];
  toggleGenre: (genre: string) => void;
  selectedFeatures: string[];
  toggleFeature: (feature: string) => void;
  clearAllFilters: () => void;
  totalActiveFilters: number;
  filterCounts: FilterCounts;
  availableGenres: string[];
  availableFeatures: string[];
  activeChips: FilterChip[];
  removeFilterChip: (id: string) => void;
  filteredGames: GameDto[];
  groupedGames: Record<string, GameDto[]>;
  groupBy: GroupBy;
  setGroupBy: (mode: GroupBy) => void;
  collapsedGroups: Record<string, boolean>;
  toggleGroup: (group: string) => void;
  currentGroupLabel: string;
  detailsSearchQuery: string;
  setDetailsSearchQuery: (q: string) => void;
  detailsFilteredGames: GameDto[];
  handleOpenContextMenu: (e: React.MouseEvent, game: GameDto) => void;
  handleLaunch: (gameId: string) => void;
  handleEnrichSingleGame: (gameId: string) => void;
  handleRefreshHltb: (gameId: string) => void;
  isEnrichingSingle: boolean;
  handleOpenInstallDir: (gameId: string) => void;
  handleCreateShortcut: (gameId: string) => void;
  handleVerifyFiles: (gameId: string) => void;
  handleOpenUninstallModal: (game: GameDto) => void;
  handleRemoveFromLibrary: (gameId: string) => void;
  handleToggleHidden?: (game: GameDto) => void;
  handleToggleFavorite?: (game: GameDto) => void;
  handlePromoteCopy?: (copyId: string) => void;
}

export const DesktopView: React.FC<DesktopViewProps> = ({
  currentTheme,
  searchQuery,
  setSearchQuery,
  toggleFullscreen,
  handleToggleSound,
  loadProvidersAndConfig,
  providers,
  handleSync,
  handleMinimize,
  handleToggleMaximize,
  handleClose,
  handleStartDragging,
  t,
  formatDuration,
  handleKillRunningGame,
  activeFilter,
  setActiveFilter,
  isFilterActive,
  gamepadConnected,
  gamepadName,
  handleOpenFolder,
  sortMode,
  setSortMode,
  selectedFlags,
  toggleFlag,
  selectedStatuses,
  toggleStatus,
  selectedStores,
  toggleStore,
  selectedGenres,
  toggleGenre,
  selectedFeatures,
  toggleFeature,
  clearAllFilters,
  totalActiveFilters,
  filterCounts,
  availableGenres,
  availableFeatures,
  activeChips,
  removeFilterChip,
  filteredGames,
  groupedGames,
  groupBy,
  setGroupBy,
  collapsedGroups,
  toggleGroup,
  currentGroupLabel,
  detailsSearchQuery,
  setDetailsSearchQuery,
  detailsFilteredGames,
  handleOpenContextMenu,
  handleLaunch,
  handleEnrichSingleGame,
  handleRefreshHltb,
  isEnrichingSingle,
  handleOpenInstallDir,
  handleCreateShortcut,
  handleVerifyFiles,
  handleOpenUninstallModal,
  handleRemoveFromLibrary,
  handleToggleHidden,
  handleToggleFavorite,
  handlePromoteCopy,
}) => {
  const { games, counts, selectedGame, setSelectedGame } = useLibraryStore();
  const {
    viewMode,
    setViewMode,
    soundEnabled,
    setShowSettingsModal,
    openSettings: handleOpenSettings,
    setShowThemeModal,
    setShowPluginModal,
    setShowAddCustomModal,
    setShowBatchEnrichModal,
    setIsPlayniteImportOpen,
    isSyncing,
    activeGame,
    isGameRunning,
    setGameToEdit,
    setShowEditorModal,
    setGameToResolve,
    setShowResolutionModal,
    statusMessage,
    achievementSync,
  } = useUiStore();
  const totalGamesCount = games.length;
  const onOpenSettings = handleOpenSettings;
  const onOpenPlayniteImport = () => setIsPlayniteImportOpen(true);
  const [gridCardWidth, setGridCardWidth] = useState<number>(180);
  const [detailsSidebarOpen, setDetailsSidebarOpen] = useState<boolean>(true);

  // Filter & Group By Popovers (Radix handles click-outside, Escape, and focus)
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showGroupByMenu, setShowGroupByMenu] = useState(false);

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {/* TOP NAVIGATION & TITLEBAR */}
      <TopBar
        currentTheme={currentTheme}
        viewMode={viewMode}
        setViewMode={setViewMode}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        toggleFullscreen={toggleFullscreen}
        handleToggleSound={handleToggleSound}
        soundEnabled={soundEnabled}
        setShowSettingsModal={setShowSettingsModal}
        onOpenSettings={onOpenSettings}
        setShowThemeModal={setShowThemeModal}
        loadProvidersAndConfig={loadProvidersAndConfig}
        setShowPluginModal={setShowPluginModal}
        providers={providers}
        setShowAddCustomModal={setShowAddCustomModal}
        setShowBatchEnrichModal={setShowBatchEnrichModal}
        onOpenPlayniteImport={onOpenPlayniteImport}
        handleSync={handleSync}
        isSyncing={isSyncing}
        handleMinimize={handleMinimize}
        handleToggleMaximize={handleToggleMaximize}
        handleClose={handleClose}
        handleStartDragging={handleStartDragging}
        t={t}
        activeGame={activeGame}
        formatDuration={formatDuration}
        handleKillRunningGame={handleKillRunningGame}
      />

      {/* MAIN BODY */}
      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR NAVIGATION */}
        <Sidebar
          counts={counts}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          isFilterActive={isFilterActive}
          gamepadConnected={gamepadConnected}
          gamepadName={gamepadName}
          handleOpenFolder={handleOpenFolder}
          onOpenStoreAccounts={() => handleOpenSettings("accounts")}
          onOpenEmulatorSettings={() => handleOpenSettings("emulators")}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />

        {/* MAIN CATALOG VIEW */}
        <main
          className="flex-1 flex flex-col overflow-hidden transition-colors duration-300 relative"
          style={{ backgroundColor: "var(--bg-base)" }}
        >
          {/* Cinema Lounge Dynamic Video Trailer Backdrop */}
          {currentTheme.enable_video_backdrop && viewMode !== "details" && (
            <VideoBackdrop
              game={selectedGame}
              theme={currentTheme}
              blurLevel="ambient"
              className="opacity-40"
              isPaused={isGameRunning}
            />
          )}

          {/* CONTEXTUAL TOOLBAR */}
          <CatalogToolbar
            viewMode={viewMode}
            showFilterMenu={showFilterMenu}
            setShowFilterMenu={setShowFilterMenu}
            sortMode={sortMode}
            setSortMode={setSortMode}
            selectedFlags={selectedFlags}
            toggleFlag={toggleFlag}
            selectedStatuses={selectedStatuses}
            toggleStatus={toggleStatus}
            selectedStores={selectedStores}
            toggleStore={toggleStore}
            selectedGenres={selectedGenres}
            toggleGenre={toggleGenre}
            selectedFeatures={selectedFeatures}
            toggleFeature={toggleFeature}
            clearAllFilters={clearAllFilters}
            totalActiveFilters={totalActiveFilters}
            filterCounts={filterCounts}
            availableGenres={availableGenres}
            availableFeatures={availableFeatures}
            activeChips={activeChips}
            removeFilterChip={removeFilterChip}
            searchQuery={searchQuery}
            filteredGamesCount={filteredGames.length}
            totalGamesCount={totalGamesCount}
            showGroupByMenu={showGroupByMenu}
            setShowGroupByMenu={setShowGroupByMenu}
            groupBy={groupBy}
            setGroupBy={setGroupBy}
            currentGroupLabel={currentGroupLabel}
            gridCardWidth={gridCardWidth}
            setGridCardWidth={setGridCardWidth}
            t={t}
          />

          <ErrorBoundary
            scope={`DesktopCatalog:${viewMode}`}
            variant="panel"
            resetKeys={[viewMode, selectedGame?.id]}
            secondaryAction={
              viewMode !== "grid"
                ? {
                    label: t("error_boundary.back_to_grid", {
                      defaultValue: "Back to grid",
                    }),
                    onClick: () => setViewMode("grid"),
                  }
                : undefined
            }
          >
            {/* VIEW 1: POSTER GRID VIEW */}
            {viewMode === "grid" && (
            <GridView
              filteredGames={filteredGames}
              groupedGames={groupedGames}
              groupBy={groupBy}
              collapsedGroups={collapsedGroups}
              toggleGroup={toggleGroup}
              gridCardWidth={gridCardWidth}
              selectedGame={selectedGame}
              setSelectedGame={setSelectedGame}
              setViewMode={setViewMode}
              handleOpenContextMenu={handleOpenContextMenu}
              handleLaunch={handleLaunch}
              setGameToEdit={setGameToEdit}
              setShowEditorModal={setShowEditorModal}
              activeGame={activeGame}
              formatDuration={formatDuration}
              handleKillRunningGame={handleKillRunningGame}
              activeFilter={activeFilter}
              searchQuery={searchQuery}
              onClearFilters={clearAllFilters}
              hasActiveFilters={totalActiveFilters > 0 || searchQuery.trim() !== ""}
            />
          )}

            {/* VIEW 2: DETAILS SPLIT-PANEL VIEW */}
            {viewMode === "details" && (
              filteredGames.length === 0 ? (
                <EmptyGamesView
                  onClearFilters={clearAllFilters}
                  hasActiveFilters={totalActiveFilters > 0 || searchQuery.trim() !== ""}
                />
              ) : selectedGame ? (
                <Suspense fallback={<div className="flex-1 min-h-0" />}>
                  <DetailsSplitView
                    currentTheme={currentTheme}
                    selectedGame={selectedGame}
                    setSelectedGame={setSelectedGame}
                    detailsSidebarOpen={detailsSidebarOpen}
                    setDetailsSidebarOpen={setDetailsSidebarOpen}
                    detailsSearchQuery={detailsSearchQuery}
                    setDetailsSearchQuery={setDetailsSearchQuery}
                    detailsFilteredGames={detailsFilteredGames}
                    setViewMode={setViewMode}
                    handleOpenContextMenu={handleOpenContextMenu}
                    handleLaunch={handleLaunch}
                    handleEnrichSingleGame={handleEnrichSingleGame}
                    handleRefreshHltb={handleRefreshHltb}
                    isEnrichingSingle={isEnrichingSingle}
                    setGameToEdit={setGameToEdit}
                    setShowEditorModal={setShowEditorModal}
                    setGameToResolve={setGameToResolve}
                    setShowResolutionModal={setShowResolutionModal}
                    t={t}
                    isGameRunning={isGameRunning}
                    activeGame={activeGame}
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
                    handleToggleHidden={handleToggleHidden}
                    handleToggleFavorite={handleToggleFavorite}
                  />
                </Suspense>
              ) : (
                <EmptyGamesView
                  onClearFilters={clearAllFilters}
                  hasActiveFilters={totalActiveFilters > 0 || searchQuery.trim() !== ""}
                />
              )
            )}

            {/* VIEW 3: COMPACT DATA TABLE VIEW */}
            {viewMode === "list" && (
              <Suspense fallback={<div className="flex-1 min-h-0" />}>
                <ListViewTable
                  games={filteredGames}
                  selectedGameId={selectedGame?.id || null}
                  onSelectGame={(g) => setSelectedGame(g)}
                  onOpenDetails={(g) => {
                    setSelectedGame(g);
                    setViewMode("details");
                  }}
                  onLaunchGame={handleLaunch}
                  onEditGame={(g) => {
                    setGameToEdit(g);
                    setShowEditorModal(true);
                  }}
                  onContextMenu={handleOpenContextMenu}
                />
              </Suspense>
            )}

            {/* VIEW 4: DETAILED STATS DASHBOARD */}
            {viewMode === "stats" && (
              <Suspense fallback={<div className="flex-1 min-h-0" />}>
                <StatisticsDashboardView
                  onSelectGame={(gameId) => {
                    const target = filteredGames.find((g) => g.id === gameId);
                    if (target) {
                      setSelectedGame(target);
                      setViewMode("details");
                    }
                  }}
                />
              </Suspense>
            )}
          </ErrorBoundary>
        </main>
      </div>

      {/* FOOTER STATUS BAR */}
      <StatusBar
        gamepadConnected={gamepadConnected}
        gamepadName={gamepadName}
        activeGame={activeGame}
        formatDuration={formatDuration}
        handleKillRunningGame={handleKillRunningGame}
        isSyncing={isSyncing}
        statusMessage={statusMessage}
        achievementSync={achievementSync}
        currentThemeName={currentTheme.name}
        t={t}
      />
    </div>
    </TooltipProvider>
  );
};
