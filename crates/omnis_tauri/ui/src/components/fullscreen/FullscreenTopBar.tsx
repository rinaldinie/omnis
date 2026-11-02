import React from "react";
import { Menu, Search, Gamepad2, Sparkles } from "lucide-react";
import { ActiveGameSession } from "../../types";
import { StoreIcon } from "../StoreBadge";
import soundEffects from "../../utils/soundEffects";
import { Glyph } from "./ConsoleChrome";
import type { HomeFocusZone } from "../../hooks/useGamepadNavigation";
import { STORE_LABELS, duration } from "./constants";

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
  t: (key: string, params?: Record<string, any>) => string;
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
  return (
    <header className="relative z-20 flex items-center gap-6 px-10 pt-6 pb-2 shrink-0">
      <button
        type="button"
        onClick={() => setIsMenuOpen?.((prev) => !prev)}
        className="cursor-pointer flex items-center gap-2.5 px-4 py-2 rounded-full text-sm font-semibold uppercase tracking-wider transition-colors duration-150 border-none"
        style={
          homeFocusZone === "topbar" || isMenuOpen
            ? { backgroundColor: "#ffffff", color: "#0b0f19" }
            : { backgroundColor: "rgba(255, 255, 255, 0.08)", color: "rgba(255, 255, 255, 0.85)" }
        }
      >
        <Menu className="w-4 h-4" />
        <span>{t("console_ui.menu")}</span>
      </button>

      <nav className="flex-1 min-w-0 flex items-center justify-center gap-3">
        <button
          type="button"
          className="cursor-pointer hover:opacity-100 opacity-80 transition-opacity bg-transparent border-none p-0 inline-flex items-center justify-center text-inherit"
          onClick={() => {
            cycleFilter(-1, () => setFocusedIndex(0));
            soundEffects.playNav();
          }}
          title="Previous Category"
        >
          <Glyph kind="lb" />
        </button>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0">
          {visibleFilters.map((id) => {
            const isActive = id === activeCategory;
            return (
              <button
                type="button"
                key={id}
                ref={(el) => {
                  tabRefs.current[id] = el;
                }}
                className={`cursor-pointer flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap text-sm font-semibold uppercase tracking-wider transition-colors duration-150 border-none ${
                  isActive ? "hover:bg-white/25" : "hover:bg-white/10"
                }`}
                style={
                  isActive
                    ? { backgroundColor: "rgba(255, 255, 255, 0.16)", color: "#ffffff" }
                    : { color: "rgba(255, 255, 255, 0.55)", backgroundColor: "transparent" }
                }
                onClick={() => {
                  if (id !== activeCategory) {
                    soundEffects.playNav();
                    setActiveFilter(id);
                    setFocusedIndex(0);
                  }
                }}
              >
                {STORE_LABELS[id] && <StoreIcon library={id} className="w-3.5 h-3.5" />}
                {filterLabel(id)}
                {isActive && <span className="text-xs font-medium opacity-60">{filterCount(id)}</span>}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="cursor-pointer hover:opacity-100 opacity-80 transition-opacity bg-transparent border-none p-0 inline-flex items-center justify-center text-inherit"
          onClick={() => {
            cycleFilter(1, () => setFocusedIndex(0));
            soundEffects.playNav();
          }}
          title="Next Category"
        >
          <Glyph kind="rb" />
        </button>
      </nav>

      <div className="flex items-center gap-5 text-white/90 shrink-0">
        {activeGame && (
          <span
            className={`flex items-center gap-2 text-sm font-medium ${
              activeGame.state === "stopping"
                ? "text-rose-300"
                : activeGame.state === "launching"
                ? "text-amber-300"
                : "text-emerald-300"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
            <span className="max-w-[14rem] truncate">{activeGame.title}</span>
            {activeGame.state === "running" && <span className="text-white/60">{duration(actualElapsed)}</span>}
          </span>
        )}
        {hasUpdate && <Sparkles className="w-5 h-5 text-sky-300" />}
        {searchQuery && (
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Search className="w-4 h-4" />
            <span className="max-w-[10rem] truncate">{searchQuery}</span>
          </span>
        )}
        <Gamepad2 className={`w-5 h-5 ${gamepadConnected ? "text-white" : "text-white/35"}`} />
        <span className="text-xl font-medium tabular-nums">{clock}</span>
      </div>
    </header>
  );
};
