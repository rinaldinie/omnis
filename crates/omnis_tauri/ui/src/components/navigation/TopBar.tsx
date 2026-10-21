import React from "react";
import {
  Zap,
  LayoutGrid,
  PanelLeft,
  TableProperties,
  Search,
  X,
  Tv,
  Volume2,
  VolumeX,
  Settings,
  Palette,
  Puzzle,
  PlusCircle,
  Pencil,
  RefreshCw,
  Download,
  Sparkles,
  ZoomOut,
  ZoomIn,
  Minus,
  Square,
  MoreHorizontal,
} from "lucide-react";
import { ActiveGameSession, GameDto, ProviderInfo, ThemeConfig, ViewMode } from "../../types";
import soundEffects from "../../utils/soundEffects";

interface TopBarProps {
  currentTheme: ThemeConfig;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  toggleBigPicture: () => void;
  handleToggleSound: () => void;
  soundEnabled: boolean;
  setShowSettingsModal: (open: boolean) => void;
  currentLocaleInfo: { flag: string };
  setShowThemeModal: (open: boolean) => void;
  loadProvidersAndConfig: () => void;
  setShowPluginModal: (open: boolean) => void;
  providers: ProviderInfo[];
  setShowAddCustomModal: (open: boolean) => void;
  selectedGame: GameDto | null;
  setGameToEdit: (game: any) => void;
  setShowEditorModal: (open: boolean) => void;
  handleSync: () => void;
  isSyncing: boolean;
  handleDownloadAll: () => void;
  isDownloading: boolean;
  uiZoom: number;
  setUiZoom: React.Dispatch<React.SetStateAction<number>>;
  handleMinimize: () => void;
  handleToggleMaximize: () => void;
  handleClose: () => void;
  handleStartDragging: (e: React.MouseEvent) => void;
  t: (key: string, params?: Record<string, any>) => string;
  activeGame?: ActiveGameSession | null;
  elapsedSeconds?: number;
  formatDuration?: (seconds: number) => string;
  handleKillRunningGame?: () => void;
  setShowBatchEnrichModal?: (open: boolean) => void;
}

export default function TopBar({
  currentTheme,
  viewMode,
  setViewMode,
  searchQuery,
  setSearchQuery,
  toggleBigPicture,
  handleToggleSound,
  soundEnabled,
  setShowSettingsModal,
  currentLocaleInfo,
  setShowThemeModal,
  loadProvidersAndConfig,
  setShowPluginModal,
  providers,
  setShowAddCustomModal,
  selectedGame,
  setGameToEdit,
  setShowEditorModal,
  handleSync,
  isSyncing,
  handleDownloadAll,
  isDownloading,
  uiZoom,
  setUiZoom,
  handleMinimize,
  handleToggleMaximize,
  handleClose,
  handleStartDragging,
  t,
  activeGame,
  elapsedSeconds,
  formatDuration,
  handleKillRunningGame,
  setShowBatchEnrichModal,
}: TopBarProps) {
  const [showMoreMenu, setShowMoreMenu] = React.useState(false);
  const moreMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMoreMenu]);

  return (
    <header
      data-omnis="topbar"
      onMouseDown={handleStartDragging}
      onDoubleClick={handleToggleMaximize}
      data-tauri-drag-region
      className="h-14 min-h-[56px] max-h-[56px] border-b flex items-center justify-between px-3 z-40 transition-colors duration-300 cursor-default select-none overflow-hidden"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-color)",
      }}
    >
      {/* Left: Brand Logo & Segmented Switcher */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-all shrink-0"
            style={{
              backgroundColor: "var(--accent-primary)",
              boxShadow: `0 0 15px var(--accent-glow)`,
            }}
          >
            <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-semibold text-sm tracking-wider text-white">OMNIS</span>
            <span
              className="font-extrabold text-[8px] tracking-widest uppercase"
              style={{ color: "var(--accent-primary)" }}
            >
              {currentTheme.name.split(" ")[0]} EDITION
            </span>
          </div>
        </div>

        <div className="h-5 w-[1px]" style={{ backgroundColor: "var(--border-color)" }} />

        {/* Segmented View Switcher */}
        <div
          className="p-1 rounded-lg border flex items-center gap-1 shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all"
            style={{
              backgroundColor: viewMode === "grid" ? "var(--accent-primary)" : "transparent",
              color: viewMode === "grid" ? "#ffffff" : "var(--text-muted)",
            }}
            title={t("views.grid")}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t("views.grid")}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("details")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all"
            style={{
              backgroundColor: viewMode === "details" ? "var(--accent-primary)" : "transparent",
              color: viewMode === "details" ? "#ffffff" : "var(--text-muted)",
            }}
            title={t("views.details")}
          >
            <PanelLeft className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t("views.details")}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all"
            style={{
              backgroundColor: viewMode === "list" ? "var(--accent-primary)" : "transparent",
              color: viewMode === "list" ? "#ffffff" : "var(--text-muted)",
            }}
            title={t("views.list")}
          >
            <TableProperties className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t("views.list")}</span>
          </button>
        </div>
      </div>

      {/* Center: Search Bar */}
      <div className="flex-1 min-w-[100px] max-w-xs mx-2">
        <div className="relative flex items-center">
          <Search
            className="w-4 h-4 absolute left-3 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            placeholder={t("topbar.search_placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-9 pr-8 rounded-lg text-xs focus:outline-none transition-all border"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Active Running Game Pill in Desktop TopBar */}
      {activeGame && (
        <div className="hidden 2xl:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/60 text-emerald-300 text-xs font-bold animate-pulse backdrop-blur-md shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
          <span className="truncate max-w-[180px]" title={activeGame.title}>
            ● {t("status.running")}: {activeGame.title} ({formatDuration ? formatDuration(elapsedSeconds || 0) : `${elapsedSeconds || 0}s`})
          </span>
          {handleKillRunningGame && (
            <button
              type="button"
              onClick={handleKillRunningGame}
              className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shrink-0"
              title={t("status.kill_game_title")}
            >
              {t("status.kill_game")}
            </button>
          )}
        </div>
      )}

      {/* Right Section: Actions Bar + Window Controls (Protected & Unified in One Flex Row) */}
      <div className="flex items-center gap-1.5 shrink-0 ml-auto" data-no-drag="true">
        {/* Big Picture Button */}
        <button
          type="button"
          onClick={toggleBigPicture}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-md hover:brightness-110 active:opacity-90 shrink-0"
          style={{
            backgroundColor: "var(--accent-primary)",
            boxShadow: `0 0 15px var(--accent-glow)`,
          }}
          title={t("topbar.big_picture")}
        >
          <Tv className="w-3.5 h-3.5" />
          <span className="hidden 2xl:inline">{t("topbar.big_picture")}</span>
        </button>

        {/* Sync External Libraries */}
        <button
          type="button"
          onClick={handleSync}
          disabled={isSyncing}
          className="p-1.5 rounded-lg border transition-all shrink-0 hover:bg-white/10"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          title={t("topbar.sync")}
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-white" : ""}`} />
        </button>

        {/* Batch Enrich */}
        <button
          type="button"
          onClick={() => (setShowBatchEnrichModal ? setShowBatchEnrichModal(true) : handleDownloadAll())}
          disabled={isDownloading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 active:opacity-90 shadow-sm shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          title={t("topbar.enrich_tooltip")}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden 2xl:inline">{t("topbar.enrich_button")}</span>
        </button>

        {/* Add Game */}
        <button
          type="button"
          onClick={() => setShowAddCustomModal(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 hover:border-slate-400 active:opacity-90 shadow-sm shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          title={t("topbar.add_game_title")}
        >
          <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden 2xl:inline">{t("topbar.add_game")}</span>
        </button>

        {/* Settings & Options */}
        <button
          type="button"
          onClick={() => {
            soundEffects.playSelect();
            setShowSettingsModal(true);
          }}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 active:opacity-90 shadow-sm shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          title={t("topbar.options")}
        >
          <span className="text-sm leading-none">{currentLocaleInfo.flag}</span>
          <Settings className="w-3.5 h-3.5" style={{ color: "var(--accent-primary)" }} />
          <span className="hidden 2xl:inline">{t("topbar.options")}</span>
        </button>

        {/* Inline Secondary Actions on Wide Screens (>= xl) */}
        {/* Sound Toggle */}
        <button
          type="button"
          onClick={handleToggleSound}
          className="hidden xl:flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-sm hover:bg-white/10 active:opacity-90 shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: soundEnabled ? "var(--text-primary)" : "var(--text-muted)",
          }}
          title={soundEnabled ? t("topbar.audio_on") : t("topbar.audio_off")}
        >
          {soundEnabled ? (
            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <VolumeX className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span className="hidden 2xl:inline">
            {soundEnabled ? t("topbar.audio_on") : t("topbar.audio_off")}
          </span>
        </button>

        {/* Themes Button */}
        <button
          type="button"
          onClick={() => setShowThemeModal(true)}
          className="hidden xl:flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 active:opacity-90 shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          title={t("topbar.themes_title")}
        >
          <Palette className="w-3.5 h-3.5" style={{ color: "var(--accent-primary)" }} />
          <span className="hidden 2xl:inline">{t("topbar.themes")}</span>
        </button>

        {/* Plugins Button */}
        <button
          type="button"
          onClick={() => {
            loadProvidersAndConfig();
            setShowPluginModal(true);
          }}
          className="hidden xl:flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 active:opacity-90 shadow-sm shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          title={t("topbar.plugins_title")}
        >
          <Puzzle className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden 2xl:inline">{t("topbar.plugins")}</span>
          {providers.filter((p) => p.has_configured_key || !p.requires_api_key).length > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
          )}
        </button>

        {/* Edit Selected Game (if any) */}
        {selectedGame && (
          <button
            type="button"
            onClick={() => {
              setGameToEdit(selectedGame);
              setShowEditorModal(true);
            }}
            className="hidden xl:flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 hover:border-slate-400 active:opacity-90 shadow-sm shrink-0"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
            title={t("topbar.edit_game_title", { title: selectedGame.title })}
          >
            <Pencil className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden 2xl:inline">{t("topbar.edit_info")}</span>
          </button>
        )}

        {/* Zoom Controls on 2xl */}
        <div
          className="hidden 2xl:flex items-center gap-1 p-0.5 rounded-lg border shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <button
            type="button"
            onClick={() => setUiZoom((z) => Math.max(0.7, z - 0.1))}
            className="p-1 hover:text-white"
            style={{ color: "var(--text-muted)" }}
            title={t("topbar.zoom_out")}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span
            className="text-[10px] font-mono px-1"
            style={{ color: "var(--text-primary)" }}
          >
            {Math.round(uiZoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setUiZoom((z) => Math.min(1.5, z + 0.1))}
            className="p-1 hover:text-white"
            style={{ color: "var(--text-muted)" }}
            title={t("topbar.zoom_in")}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Overflow Menu for smaller/non-fullscreen windows (< xl) */}
        <div className="relative xl:hidden" ref={moreMenuRef}>
          <button
            type="button"
            onClick={() => setShowMoreMenu((prev) => !prev)}
            className="p-1.5 rounded-lg border transition-all text-slate-300 hover:text-white hover:bg-white/10 shrink-0"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
            title="Altri strumenti e opzioni"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {showMoreMenu && (
            <div
              className="absolute right-0 top-full mt-2 w-56 rounded-xl border p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "rgba(255, 255, 255, 0.12)",
                boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  setShowThemeModal(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Palette className="w-4 h-4 text-indigo-400" />
                <span>{t("topbar.themes")}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  loadProvidersAndConfig();
                  setShowPluginModal(true);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Puzzle className="w-4 h-4 text-indigo-400" />
                  <span>{t("topbar.plugins")}</span>
                </div>
                {providers.filter((p) => p.has_configured_key || !p.requires_api_key).length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  handleToggleSound();
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  {soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-slate-400" />
                  )}
                  <span>{t("topbar.audio_ui")}</span>
                </div>
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  {soundEnabled ? "ON" : "OFF"}
                </span>
              </button>

              {selectedGame && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    setGameToEdit(selectedGame);
                    setShowEditorModal(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Pencil className="w-4 h-4 text-indigo-400" />
                  <span className="truncate">{t("topbar.edit_info")} ("{selectedGame.title}")</span>
                </button>
              )}

              <div className="border-t border-white/10 my-1 pt-1.5 px-3 flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">{t("topbar.zoom_ui")}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setUiZoom((z) => Math.max(0.7, z - 0.1))}
                    className="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white"
                    title={t("topbar.zoom_out")}
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-mono text-white">
                    {Math.round(uiZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setUiZoom((z) => Math.min(1.5, z + 0.1))}
                    className="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white"
                    title={t("topbar.zoom_in")}
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Clean Native Title Bar Separator */}
        <div className="h-5 w-[1px] bg-white/10 mx-1 shrink-0" />

        {/* Window Controls (Minimize, Maximize, Close) - Dedicated & Protected */}
        <div
          className="flex items-center gap-0.5 shrink-0"
          data-no-drag="true"
        >
          <button
            type="button"
            onClick={handleMinimize}
            className="w-8 h-8 rounded-lg hover:bg-white/10 active:bg-white/20 flex items-center justify-center transition-all cursor-pointer text-slate-400 hover:text-white"
            title="Riduci a icona"
            data-no-drag="true"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleToggleMaximize}
            className="w-8 h-8 rounded-lg hover:bg-white/10 active:bg-white/20 flex items-center justify-center transition-all cursor-pointer text-slate-400 hover:text-white"
            title="Ingrandisci / Ripristina finestra"
            data-no-drag="true"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-lg hover:bg-rose-600 hover:text-white active:bg-rose-700 flex items-center justify-center transition-all cursor-pointer text-slate-400"
            title={t("topbar.close_app")}
            data-no-drag="true"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
