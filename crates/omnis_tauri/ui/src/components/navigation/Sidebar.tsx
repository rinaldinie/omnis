import React from "react";
import {
  Gamepad2,
  CheckCircle2,
  Clock,
  Star,
  Swords,
  Scroll,
  Dices,
  Sparkles,
  Folder,
  Palette,
  Cloud,
} from "lucide-react";
import { LibraryCounts } from "../../types";
import { SteamIcon, EpicIcon, GogIcon, XboxIcon } from "../StoreBadge";
import { useTranslation } from "../../i18n";

interface SidebarProps {
  counts: LibraryCounts;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  isFilterActive?: (filterId: string) => boolean;
  gamepadConnected?: boolean;
  gamepadName?: string;
  handleOpenFolder: (folderType: string) => void;
  onOpenStoreAccounts?: () => void;
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
}: SidebarProps) {
  const { t } = useTranslation();
  const installedRatio = counts.total > 0 ? (counts.installed / counts.total) * 100 : 0;

  const checkActive = (id: string) => (isFilterActive ? isFilterActive(id) : activeFilter === id);

  const catalogItems = [
    { id: "all", label: t("sidebar.all_games"), count: counts.total, icon: Gamepad2 },
    { id: "installed", label: t("sidebar.installed"), count: counts.installed, icon: CheckCircle2 },
    { id: "recent", label: t("sidebar.recent"), count: counts.recent, icon: Clock },
    { id: "favorites", label: t("sidebar.favorites"), count: counts.favorites, icon: Star },
  ];

  const storeItems = [
    { id: "steam", label: "Steam", count: counts.steam, icon: SteamIcon },
    { id: "gog", label: "GOG Galaxy", count: counts.gog, icon: GogIcon },
    { id: "epic", label: "Epic Games", count: counts.epic, icon: EpicIcon },
    { id: "xbox", label: "Xbox / Pass", count: counts.xbox || 0, icon: XboxIcon },
  ];

  const genreItems = [
    { id: "action", label: t("sidebar.genre_action"), count: counts.action, icon: Swords },
    { id: "rpg", label: t("sidebar.genre_rpg"), count: counts.rpg, icon: Scroll },
    { id: "strategy", label: t("sidebar.genre_strategy"), count: counts.strategy, icon: Dices },
    { id: "indie", label: t("sidebar.genre_indie"), count: counts.indie, icon: Sparkles },
  ];

  return (
    <aside
      data-omnis="sidebar"
      className="w-52 min-w-[208px] max-w-[208px] border-r flex flex-col justify-between p-2 select-none transition-all duration-300 text-xs"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="flex flex-col gap-3 overflow-y-auto pr-0.5 custom-scrollbar">
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
              <button
                key={item.id}
                data-omnis="sidebar.item"
                data-state={isActive ? "active" : "idle"}
                onClick={() => setActiveFilter(item.id)}
                className={`flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors group ${
                  isActive
                    ? "font-semibold bg-white/10 text-white"
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
              </button>
            );
          })}
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
              <button
                type="button"
                onClick={onOpenStoreAccounts}
                className="px-1 py-0.2 rounded text-[9px] font-semibold text-sky-400 hover:text-white hover:bg-sky-500/20 transition-all flex items-center gap-1 border border-sky-500/30"
                title={t("sidebar.connect_account_title")}
              >
                <Cloud className="w-2.5 h-2.5" />
                <span>{t("sidebar.connect_account")}</span>
              </button>
            )}
          </div>
          {storeItems.map((store) => {
            const Icon = store.icon;
            const isActive = checkActive(store.id);
            return (
              <button
                key={store.id}
                data-omnis="sidebar.item"
                data-state={isActive ? "active" : "idle"}
                onClick={() => setActiveFilter(store.id)}
                className={`flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors group ${
                  isActive
                    ? "font-semibold bg-white/10 text-white"
                    : "font-normal hover:bg-white/5 text-slate-300 hover:text-white"
                }`}
                style={{
                  borderLeft: isActive ? "2.5px solid var(--accent-primary)" : "2.5px solid transparent",
                  backgroundColor: isActive ? "rgba(255, 255, 255, 0.08)" : undefined,
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{store.label}</span>
                </div>
                <span
                  className="text-[9px] font-mono px-1 py-0.2 rounded text-slate-400 bg-black/20 shrink-0"
                >
                  {store.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Section: Generi */}
        <div className="flex flex-col gap-0.5">
          <span
            className="text-[9px] font-bold tracking-wider uppercase px-2 pt-1 pb-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {t("sidebar.genres")}
          </span>
          {genreItems.map((genre) => {
            const Icon = genre.icon;
            const isActive = checkActive(genre.id);
            return (
              <button
                key={genre.id}
                data-omnis="sidebar.item"
                data-state={isActive ? "active" : "idle"}
                onClick={() => setActiveFilter(genre.id)}
                className={`flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors group ${
                  isActive
                    ? "font-semibold bg-white/10 text-white"
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
                  <span className="truncate">{genre.label}</span>
                </div>
                <span
                  className="text-[9px] font-mono px-1 py-0.2 rounded text-slate-400 bg-black/20 shrink-0"
                >
                  {genre.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

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
          <div
            className="h-1 w-full rounded-full overflow-hidden bg-white/10"
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${installedRatio}%`,
                backgroundColor: "var(--accent-primary)",
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1 pt-0.5">
          <button
            type="button"
            onClick={() => handleOpenFolder("db")}
            className="p-1 rounded text-[9px] font-medium flex flex-col items-center gap-0.5 border border-white/5 hover:border-white/20 bg-white/[0.03] hover:bg-white/10 text-slate-400 hover:text-white transition-all"
            title={t("sidebar.folder_db")}
          >
            <Folder className="w-3 h-3" />
            <span>DB</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenFolder("covers")}
            className="p-1 rounded text-[9px] font-medium flex flex-col items-center gap-0.5 border border-white/5 hover:border-white/20 bg-white/[0.03] hover:bg-white/10 text-slate-400 hover:text-white transition-all"
            title={t("sidebar.folder_covers")}
          >
            <Folder className="w-3 h-3" />
            <span>{t("sidebar.short_covers")}</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenFolder("themes")}
            className="p-1 rounded text-[9px] font-medium flex flex-col items-center gap-0.5 border border-white/5 hover:border-white/20 bg-white/[0.03] hover:bg-white/10 text-slate-400 hover:text-white transition-all"
            title={t("sidebar.folder_themes")}
          >
            <Palette className="w-3 h-3" />
            <span>{t("sidebar.short_themes")}</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenFolder("plugins")}
            className="p-1 rounded text-[9px] font-medium flex flex-col items-center gap-0.5 border border-white/5 hover:border-white/20 bg-white/[0.03] hover:bg-white/10 text-slate-400 hover:text-white transition-all"
            title={t("sidebar.folder_plugins")}
          >
            <Folder className="w-3 h-3" />
            <span>{t("sidebar.short_plugins")}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
