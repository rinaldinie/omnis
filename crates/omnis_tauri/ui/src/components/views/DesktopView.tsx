import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import {
  GameDto,
  GroupBy,
  ProviderInfo,
  ThemeConfig,
  TranslateFn,
} from "../../types";
import type { GameSortMode } from "../../utils/sortGames";
import type { FilterCounts } from "../navigation/FilterAndSortPopover";
import type { FilterChip, FilterMatchMode, useLibraryFilters } from "../../hooks/useLibraryFilters";
import { useLibraryStore, useUiStore, useModalStore } from "../../stores";
import { useOptionalGameOperationsContext } from "../../context/GameOperationsContext";
import TopBar from "../navigation/TopBar";
import Sidebar from "../navigation/Sidebar";
import VideoBackdrop from "../common/VideoBackdrop";
import { CatalogToolbar } from "../navigation/CatalogToolbar";
import GridView from "./GridView";
import EmptyGamesView from "../common/EmptyGamesView";
import { ErrorBoundary } from "../common/ErrorBoundary";
import { StatusBar } from "../navigation/StatusBar";
import { cancelBackgroundMetadataDownload } from "../../services/metadataBackgroundRunner";
import { TooltipProvider } from "@/components/ui/tooltip";

const DetailsSplitView = lazy(() => import("./DetailsSplitView"));
const ListViewTable = lazy(() => import("./ListViewTable"));
const StatisticsDashboardView = lazy(() => import("./StatisticsDashboardView"));

export interface DesktopViewProps {
  currentTheme: ThemeConfig;
  filters?: ReturnType<typeof useLibraryFilters>;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  toggleFullscreen: () => void;
  handleToggleSound: () => void;
  loadProvidersAndConfig: () => void;
  providers: ProviderInfo[];
  handleSync?: () => void;
  handleMinimize: () => void;
  handleToggleMaximize: () => void;
  handleClose: () => void;
  handleStartDragging: (e: React.MouseEvent) => void;
  t: TranslateFn;
  formatDuration: (s: number) => string;
  handleKillRunningGame?: () => void;
  activeFilter?: string;
  setActiveFilter?: (filter: string) => void;
  isFilterActive?: (filter: string) => boolean;
  gamepadConnected: boolean;
  gamepadName: string;
  handleOpenFolder?: (folder: string) => void;
  sortMode?: GameSortMode;
  setSortMode?: (mode: GameSortMode) => void;
  selectedFlags?: string[];
  toggleFlag?: (flag: string) => void;
  selectedStatuses?: string[];
  toggleStatus?: (status: string) => void;
  selectedStores?: string[];
  toggleStore?: (store: string) => void;
  selectedGenres?: string[];
  toggleGenre?: (genre: string) => void;
  genreMatchMode?: FilterMatchMode;
  setGenreMatchMode?: (mode: FilterMatchMode) => void;
  selectedFeatures?: string[];
  toggleFeature?: (feature: string) => void;
  featureMatchMode?: FilterMatchMode;
  setFeatureMatchMode?: (mode: FilterMatchMode) => void;
  clearAllFilters?: () => void;
  totalActiveFilters?: number;
  filterCounts?: FilterCounts;
  availableGenres: string[];
  availableFeatures: string[];
  activeChips?: FilterChip[];
  removeFilterChip?: (id: string) => void;
  filteredGames?: GameDto[];
  groupedGames?: Record<string, GameDto[]>;
  groupBy?: GroupBy;
  setGroupBy?: (mode: GroupBy) => void;
  collapsedGroups?: Record<string, boolean>;
  toggleGroup?: (group: string) => void;
  currentGroupLabel: string;
  detailsSearchQuery?: string;
  setDetailsSearchQuery?: (q: string) => void;
  detailsFilteredGames?: GameDto[];
  handleOpenContextMenu: (e: React.MouseEvent, game: GameDto) => void;
  handleLaunch?: (gameId: string) => void;
  handleEnrichSingleGame?: (gameId: string) => void;
  handleRefreshHltb?: (gameId: string) => void;
  isEnrichingSingle?: boolean;
  handleOpenInstallDir?: (gameId: string) => void;
  handleCreateShortcut?: (gameId: string) => void;
  handleVerifyFiles?: (gameId: string) => void;
  handleOpenUninstallModal?: (game: GameDto) => void;
  handleRemoveFromLibrary?: (gameId: string) => void;
  handleToggleHidden?: (game: GameDto) => void;
  handleToggleFavorite?: (game: GameDto) => void;
  handlePromoteCopy?: (copyId: string) => void;
}

export const DesktopView: React.FC<DesktopViewProps> = (props) => {
  const gameOps = useOptionalGameOperationsContext();
  const f = props.filters;

  const {
    currentTheme,
    toggleFullscreen,
    handleToggleSound,
    loadProvidersAndConfig,
    providers,
    handleMinimize,
    handleToggleMaximize,
    handleClose,
    handleStartDragging,
    t,
    formatDuration,
    gamepadConnected,
    gamepadName,
    availableGenres,
    availableFeatures,
    currentGroupLabel,
    handleOpenContextMenu,
  } = props;

  // Filters (resolved from props.filters or individual props for backward compatibility)
  const searchQuery = props.searchQuery ?? f?.searchQuery ?? "";
  const setSearchQuery = props.setSearchQuery ?? f?.setSearchQuery ?? (() => {});
  const activeFilter = props.activeFilter ?? f?.activeFilter ?? "all";
  const setActiveFilter = props.setActiveFilter ?? f?.setActiveFilter ?? (() => {});
  const isFilterActive = props.isFilterActive ?? f?.isFilterActive ?? (() => false);
  const sortMode = props.sortMode ?? f?.sortMode ?? "title";
  const setSortMode = props.setSortMode ?? f?.setSortMode ?? (() => {});
  const selectedFlags = props.selectedFlags ?? f?.selectedFlags ?? [];
  const toggleFlag = props.toggleFlag ?? f?.toggleFlag ?? (() => {});
  const selectedStatuses = props.selectedStatuses ?? f?.selectedStatuses ?? [];
  const toggleStatus = props.toggleStatus ?? f?.toggleStatus ?? (() => {});
  const selectedStores = props.selectedStores ?? f?.selectedStores ?? [];
  const toggleStore = props.toggleStore ?? f?.toggleStore ?? (() => {});
  const selectedGenres = props.selectedGenres ?? f?.selectedGenres ?? [];
  const toggleGenre = props.toggleGenre ?? f?.toggleGenre ?? (() => {});
  const genreMatchMode = props.genreMatchMode ?? f?.genreMatchMode;
  const setGenreMatchMode = props.setGenreMatchMode ?? f?.setGenreMatchMode;
  const selectedFeatures = props.selectedFeatures ?? f?.selectedFeatures ?? [];
  const toggleFeature = props.toggleFeature ?? f?.toggleFeature ?? (() => {});
  const featureMatchMode = props.featureMatchMode ?? f?.featureMatchMode;
  const setFeatureMatchMode = props.setFeatureMatchMode ?? f?.setFeatureMatchMode;
  const clearAllFilters = props.clearAllFilters ?? f?.clearAllFilters ?? (() => {});
  const totalActiveFilters = props.totalActiveFilters ?? f?.totalActiveFilters ?? 0;
  const defaultFilterCounts: FilterCounts = {
    total: 0,
    installed: 0,
    favorites: 0,
    recent: 0,
    stores: {},
    statuses: {},
    genres: {},
    features: {},
  };
  const filterCounts = props.filterCounts ?? f?.filterCounts ?? defaultFilterCounts;
  const activeChips = props.activeChips ?? f?.activeChips ?? [];
  const removeFilterChip = props.removeFilterChip ?? f?.removeFilterChip ?? (() => {});
  const filteredGames = props.filteredGames ?? f?.filteredGames ?? [];
  const groupedGames = props.groupedGames ?? f?.groupedGames ?? {};
  const groupBy = props.groupBy ?? f?.groupBy ?? "none";
  const setGroupBy = props.setGroupBy ?? f?.setGroupBy ?? (() => {});
  const collapsedGroups = props.collapsedGroups ?? f?.collapsedGroups ?? {};
  const toggleGroup = props.toggleGroup ?? f?.toggleGroup ?? (() => {});
  const detailsSearchQuery = props.detailsSearchQuery ?? f?.detailsSearchQuery ?? "";
  const propSetDetailsSearchQuery = props.setDetailsSearchQuery ?? f?.setDetailsSearchQuery;
  const setDetailsSearchQuery = useCallback(
    (q: string) => {
      propSetDetailsSearchQuery?.(q);
    },
    [propSetDetailsSearchQuery]
  );
  const detailsFilteredGames = props.detailsFilteredGames ?? f?.detailsFilteredGames ?? [];

  // Game Operations (resolved from GameOperationsContext or individual props)
  const handleSync = props.handleSync ?? gameOps?.handleSync ?? (() => {});
  const handleKillRunningGame = props.handleKillRunningGame ?? gameOps?.handleKillRunningGame ?? (() => {});
  const handleOpenFolder = props.handleOpenFolder ?? gameOps?.handleOpenFolder ?? (() => {});
  const handleLaunch = props.handleLaunch ?? gameOps?.handleLaunch ?? (() => {});
  const handleEnrichSingleGame = props.handleEnrichSingleGame ?? gameOps?.handleEnrichSingleGame ?? (() => {});
  const handleRefreshHltb = props.handleRefreshHltb ?? gameOps?.handleRefreshHltb ?? (() => {});
  const isEnrichingSingle = props.isEnrichingSingle ?? gameOps?.isEnrichingSingle ?? false;
  const handleOpenInstallDir = props.handleOpenInstallDir ?? gameOps?.handleOpenInstallDir ?? (() => {});
  const handleCreateShortcut = props.handleCreateShortcut ?? gameOps?.handleCreateShortcut ?? (() => {});
  const handleVerifyFiles = props.handleVerifyFiles ?? gameOps?.handleVerifyFiles ?? (() => {});
  const handleOpenUninstallModal = props.handleOpenUninstallModal ?? gameOps?.handleOpenUninstallModal ?? (() => {});
  const handleRemoveFromLibrary = props.handleRemoveFromLibrary ?? gameOps?.handleRemoveFromLibrary ?? (() => {});
  const handleToggleHidden = props.handleToggleHidden ?? gameOps?.handleToggleHidden;
  const handleToggleFavorite = props.handleToggleFavorite ?? gameOps?.handleToggleFavorite;
  const handlePromoteCopy = props.handlePromoteCopy ?? gameOps?.handlePromoteCopy;
  const { games, counts, selectedGame, setSelectedGame } = useLibraryStore();
  const {
    openSettings: handleOpenSettings,
    setGameToEdit,
    setShowEditorModal,
    setGameToResolve,
    setShowResolutionModal,
    openGameEditor,
  } = useModalStore();
  const {
    viewMode,
    setViewMode,
    soundEnabled,
    isSyncing,
    activeGame,
    isGameRunning,
    statusMessage,
    achievementSync,
    metadataDownload,
    enrichingGameIds,
  } = useUiStore();
  const totalGamesCount = games.length;
  const [gridCardWidth, setGridCardWidth] = useState<number>(180);
  const [detailsSidebarOpen, setDetailsSidebarOpen] = useState<boolean>(true);

  // Filter & Group By Popovers (Radix handles click-outside, Escape, and focus)
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showGroupByMenu, setShowGroupByMenu] = useState(false);

  // Clear local details-sidebar search when leaving Details view so entering from Grid/List never hides the selected game
  useEffect(() => {
    if (viewMode !== "details" && detailsSearchQuery !== "") {
      setDetailsSearchQuery("");
    }
  }, [viewMode, detailsSearchQuery, setDetailsSearchQuery]);

  const effectiveDetailsGame =
    selectedGame && filteredGames.some((g) => g.id === selectedGame.id)
      ? selectedGame
      : filteredGames[0] || selectedGame;

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
        loadProvidersAndConfig={loadProvidersAndConfig}
        providers={providers}
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
            genreMatchMode={genreMatchMode}
            setGenreMatchMode={setGenreMatchMode}
            selectedFeatures={selectedFeatures}
            toggleFeature={toggleFeature}
            featureMatchMode={featureMatchMode}
            setFeatureMatchMode={setFeatureMatchMode}
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
              ) : effectiveDetailsGame ? (
                <Suspense fallback={<div className="flex-1 min-h-0" />}>
                  <DetailsSplitView
                    currentTheme={currentTheme}
                    selectedGame={effectiveDetailsGame}
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
                    isEnrichingSingle={
                      enrichingGameIds.includes(effectiveDetailsGame.id) ||
                      (enrichingGameIds.length === 0 && isEnrichingSingle)
                    }
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
                  onEditGame={(g) => openGameEditor(g)}
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
        metadataDownload={metadataDownload}
        onCancelMetadataDownload={() => {
          void cancelBackgroundMetadataDownload();
        }}
        currentThemeName={currentTheme.name}
        t={t}
      />
    </div>
    </TooltipProvider>
  );
};
