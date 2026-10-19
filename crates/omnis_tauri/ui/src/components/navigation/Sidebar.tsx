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

interface SidebarProps {
  counts: LibraryCounts;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  gamepadConnected: boolean;
  gamepadName: string;
  handleOpenFolder: (folderType: string) => void;
  onOpenStoreAccounts?: () => void;
}

export default function Sidebar({
  counts,
  activeFilter,
  setActiveFilter,
  gamepadConnected,
  gamepadName,
  handleOpenFolder,
  onOpenStoreAccounts,
}: SidebarProps) {
  const installedRatio = counts.total > 0 ? (counts.installed / counts.total) * 100 : 0;

  return (
    <aside
      className="w-64 min-w-[256px] max-w-[256px] border-r flex flex-col justify-between p-3 select-none transition-colors duration-300"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="flex flex-col gap-4 overflow-y-auto pr-1">
        {/* Profile card */}
        <div
          className="p-3 rounded-xl border flex items-center gap-3 shadow-sm"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-black text-xs shadow-md"
            style={{ backgroundColor: "var(--accent-primary)" }}
          >
            PG
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white leading-tight">Player One</span>
            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              {gamepadConnected ? gamepadName : "Pronto"}
            </span>
          </div>
        </div>

        {/* Section: Catalogo Giochi */}
        <div className="flex flex-col gap-1">
          <span
            className="text-[10px] font-black tracking-widest uppercase px-2 mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Catalogo Giochi
          </span>
          {[
            { id: "all", label: "Tutti i Giochi", count: counts.total, icon: Gamepad2 },
            { id: "installed", label: "Installati", count: counts.installed, icon: CheckCircle2 },
            { id: "recent", label: "Giocati di Recente", count: counts.recent, icon: Clock },
            { id: "favorites", label: "Preferiti (90+)", count: counts.favorites, icon: Star },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeFilter === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveFilter(item.id)}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all"
                style={{
                  backgroundColor: isActive ? "var(--accent-primary)" : "transparent",
                  color: isActive ? "#ffffff" : "var(--text-muted)",
                }}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: "var(--bg-card)" }}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Section: Negozi & Client */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-2 mb-1">
            <span
              className="text-[10px] font-black tracking-widest uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              Negozi & Piattaforme
            </span>
            {onOpenStoreAccounts && (
              <button
                type="button"
                onClick={onOpenStoreAccounts}
                className="px-1.5 py-0.5 rounded text-[10px] font-bold text-indigo-400 hover:text-white hover:bg-indigo-500/20 transition-all flex items-center gap-1 border border-indigo-500/30"
                title="Gestione e Sincronizzazione Account Store Cloud (OAuth)"
              >
                <Cloud className="w-3 h-3" />
                <span>Collega</span>
              </button>
            )}
          </div>
          {[
            { id: "steam", label: "Steam", count: counts.steam, icon: SteamIcon },
            { id: "gog", label: "GOG Galaxy", count: counts.gog, icon: GogIcon },
            { id: "epic", label: "Epic Games", count: counts.epic, icon: EpicIcon },
            { id: "xbox", label: "Xbox / PC Pass", count: counts.xbox || 0, icon: XboxIcon },
          ].map((store) => {
            const Icon = store.icon;
            const isActive = activeFilter === store.id;
            return (
              <button
                key={store.id}
                onClick={() => setActiveFilter(store.id)}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all"
                style={{
                  backgroundColor: isActive ? "var(--accent-primary)" : "transparent",
                  color: isActive ? "#ffffff" : "var(--text-muted)",
                }}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{store.label}</span>
                </div>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: "var(--bg-card)" }}
                >
                  {store.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Section: Generi */}
        <div className="flex flex-col gap-1">
          <span
            className="text-[10px] font-black tracking-widest uppercase px-2 mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Generi Principali
          </span>
          {[
            { id: "action", label: "Azione", count: counts.action, icon: Swords },
            { id: "rpg", label: "GDR", count: counts.rpg, icon: Scroll },
            { id: "strategy", label: "Strategia", count: counts.strategy, icon: Dices },
            { id: "indie", label: "Indie", count: counts.indie, icon: Sparkles },
          ].map((genre) => {
            const Icon = genre.icon;
            const isActive = activeFilter === genre.id;
            return (
              <button
                key={genre.id}
                onClick={() => setActiveFilter(genre.id)}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all"
                style={{
                  backgroundColor: isActive ? "var(--accent-primary)" : "transparent",
                  color: isActive ? "#ffffff" : "var(--text-muted)",
                }}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{genre.label}</span>
                </div>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: "var(--bg-card)" }}
                >
                  {genre.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sidebar Footer */}
      <div
        className="pt-3 border-t flex flex-col gap-2.5"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex flex-col gap-1 px-1">
          <div
            className="flex justify-between text-[10px] font-bold"
            style={{ color: "var(--text-muted)" }}
          >
            <span>Installati</span>
            <span>
              {counts.installed} / {counts.total} ({Math.round(installedRatio)}%)
            </span>
          </div>
          <div
            className="h-1.5 w-full rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--bg-card)" }}
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

        <div className="grid grid-cols-4 gap-1 pt-1">
          <button
            onClick={() => handleOpenFolder("db")}
            className="p-1.5 rounded-lg text-[10px] font-bold flex flex-col items-center gap-1 border transition-all"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: "var(--text-muted)",
            }}
            title="Apri cartella Database"
          >
            <Folder className="w-3.5 h-3.5" />
            <span>DB</span>
          </button>
          <button
            onClick={() => handleOpenFolder("covers")}
            className="p-1.5 rounded-lg text-[10px] font-bold flex flex-col items-center gap-1 border transition-all"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: "var(--text-muted)",
            }}
            title="Apri cartella Locandine"
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Cover</span>
          </button>
          <button
            onClick={() => handleOpenFolder("themes")}
            className="p-1.5 rounded-lg text-[10px] font-bold flex flex-col items-center gap-1 border transition-all"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: "var(--text-muted)",
            }}
            title="Apri cartella Temi JSON"
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Temi</span>
          </button>
          <button
            onClick={() => handleOpenFolder("plugins")}
            className="p-1.5 rounded-lg text-[10px] font-bold flex flex-col items-center gap-1 border transition-all"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: "var(--text-muted)",
            }}
            title="Apri cartella Plugin"
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Plug</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
