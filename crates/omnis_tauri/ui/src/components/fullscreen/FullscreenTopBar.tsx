import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Menu,
  Search,
  Gamepad2,
  Sparkles,
  Wifi,
  WifiOff,
  Battery,
  BatteryCharging,
  BatteryLow,
  BatteryMedium,
  BatteryFull,
  LayoutGrid,
  CheckCircle2,
  Clock,
  Star,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ActiveGameSession, TranslateFn } from "../../types";
import { StoreIcon } from "../common/StoreBadge";
import soundEffects from "../../utils/soundEffects";
import { Glyph } from "./ConsoleChrome";
import type { HomeFocusZone } from "../../hooks/useGamepadNavigation";
import {
  CONSOLE_OPTION_ACTIVE_STYLE,
  CONSOLE_PILL_STYLE,
  STORE_LABELS,
  duration,
} from "./constants";

const CATEGORY_ICONS: Partial<Record<string, LucideIcon>> = {
  all: LayoutGrid,
  installed: CheckCircle2,
  recent: Clock,
  favorites: Star,
};

export interface SystemStatus {
  batteryPercent: number | null;
  isCharging: boolean;
  wifiConnected: boolean;
  wifiSignal: number | null;
}

export interface FullscreenTopBarProps {
  isMenuOpen?: boolean;
  setIsMenuOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  homeFocusZone?: HomeFocusZone;
  cycleFilter: (direction: number, onCycle?: (nextFilter: string) => void) => void;
  visibleFilters: string[];
  activeCategory: string;
  filterLabel: (id: string) => string;
  filterCount: (id: string) => number;
  tabRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  setActiveFilter: (filter: string) => void;
  setFocusedIndex: (index: number) => void;
  activeGame?: ActiveGameSession | null;
  actualElapsed: number;
  hasUpdate: boolean;
  searchQuery: string;
  gamepadConnected: boolean;
  clock: string;
  t: TranslateFn;
}

export const FullscreenTopBar: React.FC<FullscreenTopBarProps> = ({
  isMenuOpen,
  setIsMenuOpen,
  homeFocusZone,
  cycleFilter,
  visibleFilters,
  activeCategory,
  filterLabel,
  filterCount,
  tabRefs,
  setActiveFilter,
  setFocusedIndex,
  activeGame,
  actualElapsed,
  hasUpdate,
  searchQuery,
  gamepadConnected,
  clock,
  t,
}) => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    let active = true;
    const fetchStatus = async () => {
      try {
        const status = await invoke<SystemStatus>("get_system_status");
        if (active) setSystemStatus(status);
      } catch {
        // Ignore if running outside Tauri or command unavailable
      }
    };
    fetchStatus();
    const timer = window.setInterval(fetchStatus, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const renderBatteryIcon = (percent: number, charging: boolean) => {
    if (charging) return <BatteryCharging className="w-6 h-6 text-emerald-300" />;
    if (percent <= 15) return <BatteryLow className="w-6 h-6 text-rose-400" />;
    if (percent <= 50) return <BatteryMedium className="w-6 h-6 text-white" />;
    if (percent <= 85) return <BatteryFull className="w-6 h-6 text-white" />;
    return <Battery className="w-6 h-6 text-white" />;
  };

  return (
    <header className="relative z-20 flex items-center gap-6 px-10 pt-6 pb-3 shrink-0">
      <button
        type="button"
        onClick={() => setIsMenuOpen?.((prev) => !prev)}
        className="cursor-pointer h-14 inline-flex items-center gap-3 px-6 rounded-full text-base font-semibold uppercase tracking-wider transition-all duration-150 backdrop-blur-md shadow-[0_10px_28px_rgba(0,0,0,0.45)] shrink-0"
        style={
          homeFocusZone === "topbar" || isMenuOpen
            ? CONSOLE_OPTION_ACTIVE_STYLE
            : { ...CONSOLE_PILL_STYLE, color: "#f8fafc" }
        }
      >
        <Menu className="w-6 h-6" />
        <span>{t("console_ui.menu")}</span>
      </button>

      <nav className="flex-1 min-w-0 flex items-center justify-center">
        <div
          className="h-14 inline-flex items-center gap-2.5 px-3 rounded-full backdrop-blur-md max-w-full shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
          style={CONSOLE_PILL_STYLE}
        >
          <button
            type="button"
            className="cursor-pointer opacity-90 hover:opacity-100 transition-opacity bg-transparent border-none px-1.5 py-1 inline-flex items-center justify-center text-white text-lg shrink-0"
            onClick={() => {
              cycleFilter(-1, () => setFocusedIndex(0));
              soundEffects.playNav();
            }}
            title="Previous Category"
          >
            <Glyph kind="lb" />
          </button>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0">
            {visibleFilters.map((id, index) => {
              const isActive = id === activeCategory;
              const isStoreTab = Boolean(STORE_LABELS[id]);
              const prevIsStoreTab = index > 0 && Boolean(STORE_LABELS[visibleFilters[index - 1]]);
              const CategoryIcon = CATEGORY_ICONS[id];
              const label = filterLabel(id);
              const count = filterCount(id);
              return (
                <React.Fragment key={id}>
                  {isStoreTab && !prevIsStoreTab && index > 0 && (
                    <span aria-hidden="true" className="w-px h-6 bg-white/25 mx-1 shrink-0" />
                  )}
                  <button
                    type="button"
                    ref={(el) => {
                      tabRefs.current[id] = el;
                    }}
                    aria-label={label}
                    title={`${label} (${count})`}
                    className={`cursor-pointer h-11 flex items-center justify-center gap-2 ${
                      isStoreTab || CategoryIcon ? "px-3.5" : "px-4"
                    } rounded-full whitespace-nowrap text-base font-semibold uppercase tracking-wider transition-all duration-150 border-none ${
                      isActive ? "shadow-[0_4px_14px_rgba(0,0,0,0.35)]" : "hover:bg-white/15 hover:text-white"
                    }`}
                    style={
                      isActive
                        ? { backgroundColor: "#ffffff", color: "#0b0f19" }
                        : { color: "rgba(255, 255, 255, 0.8)", backgroundColor: "transparent" }
                    }
                    onClick={() => {
                      if (id !== activeCategory) {
                        soundEffects.playNav();
                        setActiveFilter(id);
                        setFocusedIndex(0);
                      }
                    }}
                  >
                    {isStoreTab ? (
                      <StoreIcon library={id} className="w-6 h-6" />
                    ) : CategoryIcon ? (
                      <CategoryIcon className="w-6 h-6" strokeWidth={2.1} />
                    ) : (
                      <>
                        {label}
                        {isActive && <span className="text-xs font-medium opacity-70">{count}</span>}
                      </>
                    )}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
          <button
            type="button"
            className="cursor-pointer opacity-90 hover:opacity-100 transition-opacity bg-transparent border-none px-1.5 py-1 inline-flex items-center justify-center text-white text-lg shrink-0"
            onClick={() => {
              cycleFilter(1, () => setFocusedIndex(0));
              soundEffects.playNav();
            }}
            title="Next Category"
          >
            <Glyph kind="rb" />
          </button>
        </div>
      </nav>

      <div
        className="h-14 inline-flex items-center gap-4 px-6 rounded-full text-white shrink-0 backdrop-blur-md shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
        style={CONSOLE_PILL_STYLE}
      >
        {activeGame && (
          <span
            className={`flex items-center gap-2 text-base font-medium ${
              activeGame.state === "stopping"
                ? "text-rose-300"
                : activeGame.state === "launching"
                ? "text-amber-300"
                : "text-emerald-300"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-current animate-pulse" />
            <span className="max-w-[14rem] truncate">{activeGame.title}</span>
            {activeGame.state === "running" && <span className="text-white/75 tabular-nums">{duration(actualElapsed)}</span>}
          </span>
        )}
        {hasUpdate && <Sparkles className="w-6 h-6 text-sky-300" />}
        {searchQuery && (
          <span className="flex items-center gap-2 text-base font-medium">
            <Search className="w-5 h-5" />
            <span className="max-w-[10rem] truncate">{searchQuery}</span>
          </span>
        )}
        <Gamepad2 className={`w-6 h-6 ${gamepadConnected ? "text-white" : "text-white/45"}`} />
        {systemStatus && (
          <>
            <span
              className="flex items-center"
              title={
                systemStatus.wifiConnected
                  ? `Wi-Fi${systemStatus.wifiSignal !== null ? ` (${systemStatus.wifiSignal}%)` : ""}`
                  : "Wi-Fi Disconnected"
              }
            >
              {systemStatus.wifiConnected ? (
                <Wifi className="w-6 h-6 text-white" />
              ) : (
                <WifiOff className="w-6 h-6 text-white/45" />
              )}
            </span>
            {systemStatus.batteryPercent !== null && (
              <span
                className="flex items-center gap-2 text-base font-semibold tabular-nums"
                title={systemStatus.isCharging ? "Charging" : "Battery"}
              >
                {renderBatteryIcon(systemStatus.batteryPercent, systemStatus.isCharging)}
                <span
                  className={
                    systemStatus.isCharging
                      ? "text-emerald-300"
                      : systemStatus.batteryPercent <= 15
                      ? "text-rose-400"
                      : "text-white"
                  }
                >
                  {systemStatus.batteryPercent}%
                </span>
              </span>
            )}
          </>
        )}
        <span aria-hidden="true" className="w-px h-6 bg-white/20 shrink-0" />
        <span className="text-xl font-semibold tabular-nums tracking-tight">{clock}</span>
      </div>
    </header>
  );
};
