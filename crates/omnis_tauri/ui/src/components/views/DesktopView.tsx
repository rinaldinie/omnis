import React, { useState, useRef, useEffect } from "react";
import {
  ActiveGameSession,
  GameDto,
  GroupBy,
  LibraryCounts,
  ThemeConfig,
  ViewMode,
} from "../../types";
import TopBar from "../navigation/TopBar";
import Sidebar from "../navigation/Sidebar";
import VideoBackdrop from "../common/VideoBackdrop";
import { CatalogToolbar } from "../navigation/CatalogToolbar";
import GridView from "./GridView";
import DetailsSplitView from "./DetailsSplitView";
import ListViewTable from "../ListViewTable";
import StatisticsDashboardView from "./StatisticsDashboardView";
import EmptyGamesView from "../common/EmptyGamesView";
import { StatusBar } from "../navigation/StatusBar";
import type { SettingsTab } from "../settings";

export interface DesktopViewProps {
  currentTheme: ThemeConfig;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  toggleFullscreen: () => void;
  handleToggleSound: () => void;
  soundEnabled: boolean;
  setShowSettingsModal: (open: boolean) => void;
  onOpenSettings?: (tab?: SettingsTab) => void;
  setShowThemeModal: (open: boolean) => void;
  loadProvidersAndConfig: () => void;
  setShowPluginModal: (open: boolean) => void;
  providers: any[];
  setShowAddCustomModal: (open: boolean) => void;
  setShowBatchEnrichModal: (open: boolean) => void;
  onOpenPlayniteImport: () => void;
  handleSync: () => void;
  isSyncing: boolean;
  handleMinimize: () => void;
  handleToggleMaximize: () => void;
  handleClose: () => void;
  handleStartDragging: (e: React.MouseEvent) => void;
  t: (key: string, params?: Record<string, any>) => string;
  activeGame: ActiveGameSession | null;
  formatDuration: (s: number) => string;
  handleKillRunningGame: () => void;
  counts: LibraryCounts;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  isFilterActive: (filter: string) => boolean;
  gamepadConnected: boolean;
  gamepadName: string;
  handleOpenFolder: (folder: string) => void;
  handleOpenSettings: (tab: any) => void;
  isGameRunning: boolean;
  selectedGame: GameDto | null;
  setSelectedGame: React.Dispatch<React.SetStateAction<GameDto | null>>;
  sortMode: any;
  setSortMode: (mode: any) => void;
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
  filterCounts: any;
  availableGenres: string[];
  availableFeatures: string[];
  activeChips: any[];
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
  setGameToEdit: (game: GameDto | null) => void;
  setShowEditorModal: (open: boolean) => void;
  setGameToResolve: (game: GameDto | null) => void;
  setShowResolutionModal: (open: boolean) => void;
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
  statusMessage: string;
  achievementSync: any;
  totalGamesCount: number;
}

export const DesktopView: React.FC<DesktopViewProps> = ({
  currentTheme,
  viewMode,
  setViewMode,
  searchQuery,
  setSearchQuery,
  toggleFullscreen,
  handleToggleSound,
  soundEnabled,
  setShowSettingsModal,
  onOpenSettings,
  setShowThemeModal,
  loadProvidersAndConfig,
  setShowPluginModal,
  providers,
  setShowAddCustomModal,
  setShowBatchEnrichModal,
  onOpenPlayniteImport,
  handleSync,
  isSyncing,
  handleMinimize,
  handleToggleMaximize,
  handleClose,
  handleStartDragging,
  t,
  activeGame,
  formatDuration,
  handleKillRunningGame,
  counts,
  activeFilter,
  setActiveFilter,
  isFilterActive,
  gamepadConnected,
  gamepadName,
  handleOpenFolder,
  handleOpenSettings,
  isGameRunning,
  selectedGame,
  setSelectedGame,
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
  setGameToEdit,
  setShowEditorModal,
  setGameToResolve,
  setShowResolutionModal,
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
  statusMessage,
  achievementSync,
  totalGamesCount,
}) => {
  const [gridCardWidth, setGridCardWidth] = useState<number>(180);
  const [detailsSidebarOpen, setDetailsSidebarOpen] = useState<boolean>(true);

  // Filter Popover
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
      }
    };
    if (showFilterMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showFilterMenu]);

  // Group By Popover
  const [showGroupByMenu, setShowGroupByMenu] = useState(false);
  const groupByMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (groupByMenuRef.current && !groupByMenuRef.current.contains(e.target as Node)) {
        setShowGroupByMenu(false);
      }
    };
    if (showGroupByMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showGroupByMenu]);

  return (
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
            filterMenuRef={filterMenuRef}
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
            groupByMenuRef={groupByMenuRef}
            groupBy={groupBy}
            setGroupBy={setGroupBy}
            currentGroupLabel={currentGroupLabel}
            gridCardWidth={gridCardWidth}
            setGridCardWidth={setGridCardWidth}
            t={t}
          />

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
            ) : (
              <EmptyGamesView
                onClearFilters={clearAllFilters}
                hasActiveFilters={totalActiveFilters > 0 || searchQuery.trim() !== ""}
              />
            )
          )}

          {/* VIEW 3: COMPACT DATA TABLE VIEW */}
          {viewMode === "list" && (
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
          )}

          {/* VIEW 4: DETAILED STATS DASHBOARD */}
          {viewMode === "stats" && (
            <StatisticsDashboardView
              onSelectGame={(gameId) => {
                const target = filteredGames.find((g) => g.id === gameId);
                if (target) {
                  setSelectedGame(target);
                  setViewMode("details");
                }
              }}
            />
          )}
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
  );
};
