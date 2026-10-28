import React, { useRef, useState } from "react";
import {
  Zap,
  ChevronDown,
  LayoutGrid,
  PanelLeft,
  TableProperties,
  Search,
  X,
  Tv,
  RefreshCw,
  Settings,
  Minus,
  Square,
} from "lucide-react";
import { ActiveGameSession, ProviderInfo, ThemeConfig, ViewMode } from "../../types";
import soundEffects from "../../utils/soundEffects";
import { useUpdater } from "../../hooks/useAppUpdater";
import AppMenuDropdown from "./AppMenuDropdown";

export interface TopBarProps {
  currentTheme: ThemeConfig;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  toggleFullscreen?: () => void;
  toggleBigPicture?: () => void;
  handleToggleSound: () => void;
  soundEnabled: boolean;
  setShowSettingsModal: (open: boolean) => void;
  setShowThemeModal: (open: boolean) => void;
  loadProvidersAndConfig?: () => void;
  setShowPluginModal: (open: boolean) => void;
  providers?: ProviderInfo[];
  setShowAddCustomModal: (open: boolean) => void;
  setShowBatchEnrichModal?: (open: boolean) => void;
  handleSync: () => void;
  isSyncing: boolean;
  handleMinimize: () => void;
  handleToggleMaximize: () => void;
  handleClose: () => void;
  handleStartDragging: (e: React.MouseEvent) => void;
  t: (key: string, params?: Record<string, any>) => string;
  activeGame?: ActiveGameSession | null;
  elapsedSeconds?: number;
  formatDuration?: (seconds: number) => string;
  handleKillRunningGame?: () => void;
}

export default function TopBar({
  currentTheme,
  viewMode,
  setViewMode,
  searchQuery,
  setSearchQuery,
  toggleFullscreen,
  toggleBigPicture,
  handleToggleSound,
  soundEnabled,
  setShowSettingsModal,
  setShowThemeModal,
  loadProvidersAndConfig,
  setShowPluginModal,
  providers = [],
  setShowAddCustomModal,
  setShowBatchEnrichModal,
  handleSync,
  isSyncing,
  handleMinimize,
  handleToggleMaximize,
  handleClose,
  handleStartDragging,
  t,
  activeGame,
  elapsedSeconds,
  formatDuration,
  handleKillRunningGame,
}: TopBarProps) {
  const updater = useUpdater();
  const isUpdateAvailable = updater?.status === "available";
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const brandButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <header
      data-omnis="topbar"
      onMouseDown={handleStartDragging}
      onDoubleClick={handleToggleMaximize}
      data-tauri-drag-region
      className="h-14 min-h-[56px] max-h-[56px] border-b flex items-center relative z-40 transition-colors duration-300 cursor-default select-none"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-color)",
      }}
    >
      {/* Brand Column: Perfectly aligned with Sidebar (w-52 min-w-[208px] max-w-[208px] border-r) */}
      <div
        className="w-52 min-w-[208px] max-w-[208px] h-full flex items-center px-2 border-r shrink-0 relative"
        style={{ borderColor: "var(--border-color)" }}
        data-no-drag="true"
      >
        <button
          ref={brandButtonRef}
          type="button"
          onClick={() => {
            soundEffects.playSelect();
            setIsAppMenuOpen((prev) => !prev);
          }}
          className="w-full h-10 flex items-center justify-between px-2 rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer group text-left"
          title="Omnis Menu"
          aria-haspopup="true"
          aria-expanded={isAppMenuOpen}
          data-no-drag="true"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shadow-lg transition-transform group-hover:scale-105 shrink-0"
              style={{
                backgroundColor: "var(--accent-primary)",
                boxShadow: `0 0 15px var(--accent-glow)`,
              }}
            >
              <Zap className="w-3.5 h-3.5 text-white fill-white" />
            </div>
            <div className="flex flex-col leading-none truncate">
              <span className="font-bold text-xs tracking-wider text-white">OMNIS</span>
              <span
                className="font-extrabold text-[8px] tracking-widest uppercase truncate"
                style={{ color: "var(--accent-primary)" }}
              >
                {(currentTheme?.name || "Omnis").split(" ")[0]} EDITION
              </span>
            </div>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform duration-200 shrink-0 ${
              isAppMenuOpen ? "rotate-180 text-white" : ""
            }`}
          />
        </button>

        <AppMenuDropdown
          isOpen={isAppMenuOpen}
          onClose={() => setIsAppMenuOpen(false)}
          triggerRef={brandButtonRef}
          onOpenThemeModal={() => setShowThemeModal(true)}
          onOpenPluginModal={() => {
            if (loadProvidersAndConfig) loadProvidersAndConfig();
            setShowPluginModal(true);
          }}
          onOpenAddCustomModal={() => setShowAddCustomModal(true)}
          onOpenBatchEnrichModal={() => setShowBatchEnrichModal?.(true)}
          onOpenSettingsModal={() => {
            soundEffects.playSelect();
            setShowSettingsModal(true);
          }}
          onToggleSound={handleToggleSound}
          soundEnabled={soundEnabled}
          hasActiveProviders={providers?.some((p) => p.has_configured_key || !p.requires_api_key)}
          isUpdateAvailable={isUpdateAvailable}
          t={t}
        />
      </div>

      {/* Main TopBar Area: Aligned with Catalog Main Area */}
      <div className="flex-1 flex items-center justify-between px-3 h-full min-w-0">
        {/* Left: Compact View Switcher Segmented Control */}
        <div className="flex items-center gap-3 shrink-0" data-no-drag="true">
          <div
            className="p-1 rounded-lg border flex items-center gap-1 shrink-0"
            style={{
              backgroundColor: "var(--surface-pill-bg, var(--bg-card))",
              borderColor: "var(--surface-pill-border, var(--border-color))",
            }}
          >
            <button
              type="button"
              onClick={() => {
                soundEffects.playNav();
                setViewMode("grid");
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer"
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
              onClick={() => {
                soundEffects.playNav();
                setViewMode("details");
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer"
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
              onClick={() => {
                soundEffects.playNav();
                setViewMode("list");
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer"
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

        {/* Center: Global Search Bar */}
        <div className="flex-1 min-w-[120px] max-w-sm mx-3" data-no-drag="true">
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
                backgroundColor: "var(--surface-pill-bg, var(--bg-card))",
                borderColor: "var(--surface-pill-border, var(--border-color))",
                color: "var(--text-primary)",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Section: Active game, Fullscreen, Sync, Settings, Window Controls */}
        <div className="flex items-center gap-2 shrink-0 ml-auto" data-no-drag="true">
          {/* Active Running Game Pill in Desktop TopBar */}
          {activeGame && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/60 text-emerald-300 text-xs font-bold animate-pulse backdrop-blur-md shrink-0">
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

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen || toggleBigPicture}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-md hover:brightness-110 active:opacity-90 shrink-0 cursor-pointer"
            style={{
              backgroundColor: "var(--accent-primary)",
              boxShadow: `0 0 15px var(--accent-glow)`,
            }}
            title={t("topbar.fullscreen")}
          >
            <Tv className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t("topbar.fullscreen")}</span>
          </button>

          {/* Sync External Libraries */}
          <button
            type="button"
            onClick={handleSync}
            disabled={isSyncing}
            className="p-1.5 rounded-lg border transition-all shrink-0 hover:bg-white/10 disabled:opacity-50 cursor-pointer"
            style={{
              backgroundColor: "var(--surface-pill-bg, var(--bg-card))",
              borderColor: "var(--surface-pill-border, var(--border-color))",
              color: "var(--text-primary)",
            }}
            title={t("topbar.sync_tooltip") || t("topbar.sync")}
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-white" : ""}`} />
          </button>

          {/* Clean Native Title Bar Separator */}
          <div className="h-5 w-[1px] bg-white/10 mx-1 shrink-0" />

          {/* Window Controls (Minimize, Maximize, Close) */}
          <div className="flex items-center gap-0.5 shrink-0" data-no-drag="true">
            <button
              type="button"
              onClick={handleMinimize}
              className="w-8 h-8 rounded-lg hover:bg-white/10 active:bg-white/20 flex items-center justify-center transition-all cursor-pointer text-slate-400 hover:text-white"
              title={t("tooltips.minimize")}
              data-no-drag="true"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleToggleMaximize}
              className="w-8 h-8 rounded-lg hover:bg-white/10 active:bg-white/20 flex items-center justify-center transition-all cursor-pointer text-slate-400 hover:text-white"
              title={t("tooltips.maximize")}
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
      </div>
    </header>
  );
}
