import React, { useState } from "react";
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
  Minus,
  Square,
  BarChart2,
} from "lucide-react";
import { ActiveGameSession, ProviderInfo, ThemeConfig, ViewMode } from "../../types";
import soundEffects from "../../utils/soundEffects";
import { useUpdater } from "../../hooks/useAppUpdater";
import { useActiveGameTimer } from "../../context/ActiveGameTimerContext";
import AppMenuDropdown from "./AppMenuDropdown";
import type { SettingsTab } from "../settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger, ActionTooltip } from "@/components/ui/tooltip";

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
  onOpenSettings?: (tab?: SettingsTab) => void;
  setShowThemeModal: (open: boolean) => void;
  loadProvidersAndConfig?: () => void;
  setShowPluginModal: (open: boolean) => void;
  providers?: ProviderInfo[];
  setShowAddCustomModal: (open: boolean) => void;
  setShowBatchEnrichModal?: (open: boolean) => void;
  onOpenPlayniteImport?: () => void;
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
  onOpenSettings,
  setShowThemeModal,
  loadProvidersAndConfig,
  setShowPluginModal,
  providers = [],
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
  elapsedSeconds,
  formatDuration,
  handleKillRunningGame,
}: TopBarProps) {
  const updater = useUpdater();
  const isUpdateAvailable = updater?.status === "available";
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const timerContextSeconds = useActiveGameTimer();
  const actualElapsed = elapsedSeconds ?? timerContextSeconds;

  const brandTrigger = (
    <Button
      type="button"
      variant="ghost"
      onClick={() => soundEffects.playSelect()}
      className="w-full h-10 flex items-center justify-between px-2 rounded-lg hover:bg-white/5 active:bg-white/10 group text-left"
      aria-label="Omnis Menu"
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
    </Button>
  );

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
      {/* Brand Column: Aligned with Sidebar */}
      <div
        className="w-52 min-w-[208px] max-w-[208px] h-full flex items-center px-2 border-r shrink-0 relative"
        style={{ borderColor: "var(--border-color)" }}
        data-no-drag="true"
      >
        <AppMenuDropdown
          trigger={brandTrigger}
          isOpen={isAppMenuOpen}
          onOpenChange={setIsAppMenuOpen}
          onOpenThemeModal={() => setShowThemeModal(true)}
          onOpenPluginModal={() => {
            if (loadProvidersAndConfig) loadProvidersAndConfig();
            setShowPluginModal(true);
          }}
          onOpenMetadataSettings={() => {
            soundEffects.playSelect();
            if (onOpenSettings) {
              onOpenSettings("metadata-igdb");
            } else {
              setShowSettingsModal(true);
            }
          }}
          onOpenAddCustomModal={() => setShowAddCustomModal(true)}
          onOpenBatchEnrichModal={() => setShowBatchEnrichModal?.(true)}
          onOpenPlayniteImport={onOpenPlayniteImport}
          onOpenSettingsModal={() => {
            soundEffects.playSelect();
            setShowSettingsModal(true);
          }}
          onToggleSound={handleToggleSound}
          soundEnabled={soundEnabled}
          hasActiveProviders={providers?.some(
            (p) => p.has_configured_key || !p.requires_api_key
          )}
          isUpdateAvailable={isUpdateAvailable}
          t={t}
        />
      </div>

      {/* Main TopBar Area */}
      <div className="flex-1 flex items-center justify-between px-3 h-full min-w-0">
        {/* Left: View Switcher Segmented Control */}
        <div className="flex items-center gap-3 shrink-0" data-no-drag="true">
          <div
            className="p-1 rounded-lg border flex items-center gap-1 shrink-0"
            style={{
              backgroundColor: "var(--surface-pill-bg, var(--bg-card))",
              borderColor: "var(--surface-pill-border, var(--border-color))",
            }}
          >
            {(
              [
                { mode: "grid", icon: LayoutGrid, label: t("views.grid") },
                { mode: "details", icon: PanelLeft, label: t("views.details") },
                { mode: "list", icon: TableProperties, label: t("views.list") },
                { mode: "stats", icon: BarChart2, label: t("views.stats") },
              ] as const
            ).map(({ mode, icon: Icon, label }) => {
              const active = viewMode === mode;
              return (
                <Tooltip key={mode}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        soundEffects.playNav();
                        setViewMode(mode);
                      }}
                      className="flex items-center gap-1.5 h-auto px-2.5 py-1 rounded-md text-xs font-bold"
                      style={{
                        backgroundColor: active
                          ? "var(--accent-primary)"
                          : "transparent",
                        color: active ? "#ffffff" : "var(--text-muted)",
                      }}
                      aria-label={label}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">{label}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Center: Global Search Bar */}
        <div className="flex-1 min-w-[120px] max-w-sm mx-3" data-no-drag="true">
          <div className="relative flex items-center">
            <Search
              className="w-4 h-4 absolute left-3 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
            />
            <Input
              type="text"
              placeholder={t("topbar.search_placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-9 pr-8 rounded-lg text-xs"
              style={{
                backgroundColor: "var(--surface-pill-bg, var(--bg-card))",
                borderColor: "var(--surface-pill-border, var(--border-color))",
                color: "var(--text-primary)",
              }}
            />
            {searchQuery && (
              <ActionTooltip label="Clear search">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 h-6 w-6 text-slate-400 hover:text-white hover:bg-transparent"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </ActionTooltip>
            )}
          </div>
        </div>

        {/* Right Section: Active game, Fullscreen, Sync, Window Controls */}
        <div
          className="flex items-center gap-2 shrink-0 ml-auto"
          data-no-drag="true"
        >
          {/* Active Running Game Pill */}
          {activeGame && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/60 text-emerald-300 text-xs font-bold animate-pulse backdrop-blur-md shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <span className="truncate max-w-[180px]" title={activeGame.title}>
                ● {t("status.running")}: {activeGame.title} (
                {formatDuration
                  ? formatDuration(actualElapsed || 0)
                  : `${actualElapsed || 0}s`}
                )
              </span>
              {handleKillRunningGame && (
                <ActionTooltip label={t("status.kill_game_title")}>
                  <Button
                    type="button"
                    variant="destructive"
                    size="xs"
                    onClick={handleKillRunningGame}
                    className="h-auto px-2 py-0.5 rounded text-[10px] font-black shrink-0"
                    aria-label={t("status.kill_game_title")}
                  >
                    {t("status.kill_game")}
                  </Button>
                </ActionTooltip>
              )}
            </div>
          )}

          {/* Fullscreen Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                onClick={toggleFullscreen || toggleBigPicture}
                className="h-7 px-2.5 py-1.5 rounded-lg text-xs font-bold shrink-0"
                style={{
                  boxShadow: `0 0 15px var(--accent-glow)`,
                }}
              >
                <Tv className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">
                  {t("topbar.fullscreen")}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("topbar.fullscreen")}</TooltipContent>
          </Tooltip>

          {/* Sync External Libraries */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleSync}
                disabled={isSyncing}
                className="h-7 w-7 rounded-lg shrink-0"
                style={{
                  backgroundColor: "var(--surface-pill-bg, var(--bg-card))",
                  borderColor:
                    "var(--surface-pill-border, var(--border-color))",
                  color: "var(--text-primary)",
                }}
                aria-label={t("topbar.sync_tooltip") || t("topbar.sync")}
              >
                <RefreshCw
                  className={`w-4 h-4 ${isSyncing ? "animate-spin text-white" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("topbar.sync_tooltip") || t("topbar.sync")}
            </TooltipContent>
          </Tooltip>

          {/* Clean Native Title Bar Separator */}
          <div className="h-5 w-[1px] bg-white/10 mx-1 shrink-0" />

          {/* Window Controls */}
          <div className="flex items-center gap-0.5 shrink-0" data-no-drag="true">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleMinimize}
                  className="w-8 h-8 rounded-lg"
                  aria-label={t("tooltips.minimize")}
                  data-no-drag="true"
                >
                  <Minus className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("tooltips.minimize")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleToggleMaximize}
                  className="w-8 h-8 rounded-lg"
                  aria-label={t("tooltips.maximize")}
                  data-no-drag="true"
                >
                  <Square className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("tooltips.maximize")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="w-8 h-8 rounded-lg hover:bg-rose-600 hover:text-white active:bg-rose-700"
                  aria-label={t("topbar.close_app")}
                  data-no-drag="true"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("topbar.close_app")}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </header>
  );
}
