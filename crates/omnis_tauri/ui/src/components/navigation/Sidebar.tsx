import React from "react";
import {
  Gamepad2,
  CheckCircle2,
  Clock,
  Star,
  Folder,
  Palette,
  Cloud,
  BarChart2,
  EyeOff,
  Settings2,
} from "lucide-react";
import { LibraryCounts, ViewMode } from "../../types";
import { SteamIcon, EpicIcon, GogIcon, XboxIcon, SwitchIcon } from "../StoreBadge";
import { useTranslation } from "../../i18n";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { ScrollArea } from "../ui/scroll-area";

interface SidebarProps {
  counts: LibraryCounts;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  isFilterActive?: (filterId: string) => boolean;
  gamepadConnected?: boolean;
  gamepadName?: string;
  handleOpenFolder: (folderType: string) => void;
  onOpenStoreAccounts?: () => void;
  /** Opens Settings > Emulators */
  onOpenEmulatorSettings?: () => void;
  viewMode?: ViewMode;
  setViewMode?: (mode: ViewMode) => void;
}

export default function Sidebar({
  counts,
  activeFilter,
  setActiveFilter,
  isFilterActive,
  gamepadConnected: _gamepadConnected,
  gamepadName: _gamepadName,
  handleOpenFolder,
  onOpenStoreAccounts,
  onOpenEmulatorSettings,
  viewMode,
  setViewMode,
}: SidebarProps) {
  const { t } = useTranslation();
  const installedRatio = counts.total > 0 ? (counts.installed / counts.total) * 100 : 0;

  const checkActive = (id: string) => (isFilterActive ? isFilterActive(id) : activeFilter === id);

  const catalogItems = [
    { id: "all", label: t("sidebar.all_games"), count: counts.total, icon: Gamepad2 },
    { id: "installed", label: t("sidebar.installed"), count: counts.installed, icon: CheckCircle2 },
    { id: "recent", label: t("sidebar.recent"), count: counts.recent, icon: Clock },
    { id: "favorites", label: t("sidebar.favorites"), count: counts.favorites, icon: Star },
    ...(counts.hidden !== undefined && counts.hidden > 0
      ? [{ id: "hidden", label: t("sidebar.hidden"), count: counts.hidden, icon: EyeOff }]
      : []),
  ];

  const storeItems = [
    { id: "steam", label: "Steam", count: counts.steam, icon: SteamIcon },
    { id: "gog", label: "GOG Galaxy", count: counts.gog, icon: GogIcon },
    { id: "epic", label: "Epic Games", count: counts.epic, icon: EpicIcon },
    { id: "xbox", label: "Xbox / Pass", count: counts.xbox || 0, icon: XboxIcon },
  ];

  // Emulated platforms get their own section, shown once at least one has games
  const emulatorItems = [
    { id: "switch", label: "Nintendo Switch", count: counts.switch || 0, icon: SwitchIcon },
  ];
  const showEmulators = emulatorItems.some((item) => item.count > 0);

  const renderSourceItem = (source: (typeof storeItems)[number]) => {
    const Icon = source.icon;
    const isActive = checkActive(source.id);
    return (
      <Button
        key={source.id}
        type="button"
        variant="ghost"
        data-omnis="sidebar.item"
        data-state={isActive ? "active" : "idle"}
        onClick={() => {
          if (viewMode === "stats" && setViewMode) {
            setViewMode("grid");
          }
          setActiveFilter(source.id);
        }}
        className={`w-full h-auto justify-between px-2 py-1.5 rounded-md text-xs group ${
          isActive
            ? "font-semibold bg-white/10 text-white hover:bg-white/10 hover:text-white"
            : "font-normal hover:bg-white/5 text-slate-300 hover:text-white"
        }`}
        style={{
          borderLeft: isActive ? "2.5px solid var(--accent-primary)" : "2.5px solid transparent",
          backgroundColor: isActive ? "rgba(255, 255, 255, 0.08)" : undefined,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{source.label}</span>
        </div>
        <span className="text-[9px] font-mono px-1 py-0.2 rounded text-slate-400 bg-black/20 shrink-0">
          {source.count}
        </span>
      </Button>
    );
  };

  return (
    <aside
      data-omnis="sidebar"
      className="w-52 min-w-[208px] max-w-[208px] border-r flex flex-col justify-between p-2 select-none transition-all duration-300 text-xs"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-color)",
      }}
    >
      <ScrollArea className="flex-1 min-h-0 -mr-0.5 pr-0.5">
        <div className="flex flex-col gap-3">
        {/* Section: Libreria */}
        <div className="flex flex-col gap-0.5">
          <span
            className="text-[9px] font-bold tracking-wider uppercase px-2 pt-1 pb-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {t("sidebar.library")}
          </span>
          {catalogItems.map((item) => {
            const Icon = item.icon;
            const isActive = checkActive(item.id);
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                data-omnis="sidebar.item"
                data-state={isActive ? "active" : "idle"}
                onClick={() => {
                  if (viewMode === "stats" && setViewMode) {
                    setViewMode("grid");
                  }
                  setActiveFilter(item.id);
                }}
                className={`w-full h-auto justify-between px-2 py-1.5 rounded-md text-xs group ${
                  isActive
                    ? "font-semibold bg-white/10 text-white hover:bg-white/10 hover:text-white"
                    : "font-normal hover:bg-white/5 text-slate-300 hover:text-white"
                }`}
                style={{
                  borderLeft: isActive ? "2.5px solid var(--accent-primary)" : "2.5px solid transparent",
                  backgroundColor: isActive ? "rgba(255, 255, 255, 0.08)" : undefined,
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon
                    className="w-3.5 h-3.5 shrink-0 transition-transform group-hover:scale-105"
                    style={{ color: isActive ? "var(--accent-primary)" : undefined }}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                <span
                  className="text-[9px] font-mono px-1 py-0.2 rounded text-slate-400 bg-black/20 shrink-0"
                >
                  {item.count}
                </span>
              </Button>
            );
          })}
        </div>

        {/* Section: Statistiche & Insights */}
        <div className="flex flex-col gap-0.5">
          <span
            className="text-[9px] font-bold tracking-wider uppercase px-2 pt-1 pb-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {t("sidebar.analytics")}
          </span>
          <Button
            type="button"
            variant="ghost"
            data-omnis="sidebar.item"
            data-state={viewMode === "stats" ? "active" : "idle"}
            onClick={() => {
              if (setViewMode) {
                setViewMode("stats");
              }
            }}
            className={`w-full h-auto justify-between px-2 py-1.5 rounded-md text-xs group ${
              viewMode === "stats"
                ? "font-semibold bg-white/10 text-white hover:bg-white/10 hover:text-white"
                : "font-normal hover:bg-white/5 text-slate-300 hover:text-white"
            }`}
            style={{
              borderLeft: viewMode === "stats" ? "2.5px solid var(--accent-primary)" : "2.5px solid transparent",
              backgroundColor: viewMode === "stats" ? "rgba(255, 255, 255, 0.08)" : undefined,
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <BarChart2
                className="w-3.5 h-3.5 shrink-0 transition-transform group-hover:scale-105"
                style={{ color: viewMode === "stats" ? "var(--accent-primary)" : undefined }}
              />
              <span className="truncate">{t("sidebar.statistics")}</span>
            </div>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shrink-0">
              Hub
            </span>
          </Button>
        </div>

        {/* Section: Store Accounts */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between px-2 pt-1 pb-0.5">
            <span
              className="text-[9px] font-bold tracking-wider uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              {t("sidebar.stores")}
            </span>
            {onOpenStoreAccounts && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={onOpenStoreAccounts}
                className="h-auto px-1.5 py-0.5 rounded text-[9px] font-semibold text-sky-400 hover:text-white hover:bg-sky-500/20 border border-sky-500/30"
                title={t("sidebar.connect_account_title")}
              >
                <Cloud className="w-2.5 h-2.5" />
                <span>{t("sidebar.connect_account")}</span>
              </Button>
            )}
          </div>
          {storeItems.map(renderSourceItem)}
        </div>

        {/* Section: Emulators */}
        {showEmulators && (
          <div className="flex flex-col gap-0.5" data-omnis="sidebar.emulators">
            <div className="flex items-center justify-between px-2 pt-1 pb-0.5">
              <span
                className="text-[9px] font-bold tracking-wider uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                {t("sidebar.emulators")}
              </span>
              {onOpenEmulatorSettings && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onOpenEmulatorSettings}
                  className="h-5 w-5 p-0.5 rounded text-slate-500 hover:text-white hover:bg-white/10"
                  title={t("sidebar.emulator_settings_title")}
                >
                  <Settings2 className="w-3 h-3" />
                </Button>
              )}
            </div>
            {emulatorItems.map(renderSourceItem)}
          </div>
        )}
        </div>
      </ScrollArea>

      {/* Sidebar Footer (Heroic-style compact storage & folder tools) */}
      <div
        className="pt-2 border-t flex flex-col gap-1.5"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex flex-col gap-0.5 px-1">
          <div
            className="flex justify-between text-[9px] font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            <span>{t("sidebar.installed")}</span>
            <span>
              {counts.installed}/{counts.total} ({Math.round(installedRatio)}%)
            </span>
          </div>
          <Progress
            value={installedRatio}
            className="h-1 bg-white/10"
            indicatorStyle={{ backgroundColor: "var(--accent-primary)" }}
          />
        </div>

        <div className="grid grid-cols-4 gap-1 pt-0.5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenFolder("db")}
            className="h-auto p-1 rounded text-[9px] font-medium flex flex-col items-center gap-0.5 border border-white/5 hover:border-white/20 bg-white/[0.03] hover:bg-white/10 text-slate-400 hover:text-white"
            title={t("sidebar.folder_db")}
          >
            <Folder className="w-3 h-3" />
            <span>DB</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenFolder("covers")}
            className="h-auto p-1 rounded text-[9px] font-medium flex flex-col items-center gap-0.5 border border-white/5 hover:border-white/20 bg-white/[0.03] hover:bg-white/10 text-slate-400 hover:text-white"
            title={t("sidebar.folder_covers")}
          >
            <Folder className="w-3 h-3" />
            <span>{t("sidebar.short_covers")}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenFolder("themes")}
            className="h-auto p-1 rounded text-[9px] font-medium flex flex-col items-center gap-0.5 border border-white/5 hover:border-white/20 bg-white/[0.03] hover:bg-white/10 text-slate-400 hover:text-white"
            title={t("sidebar.folder_themes")}
          >
            <Palette className="w-3 h-3" />
            <span>{t("sidebar.short_themes")}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenFolder("plugins")}
            className="h-auto p-1 rounded text-[9px] font-medium flex flex-col items-center gap-0.5 border border-white/5 hover:border-white/20 bg-white/[0.03] hover:bg-white/10 text-slate-400 hover:text-white"
            title={t("sidebar.folder_plugins")}
          >
            <Folder className="w-3 h-3" />
            <span>{t("sidebar.short_plugins")}</span>
          </Button>
        </div>
      </div>
    </aside>
  );
}
