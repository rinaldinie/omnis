import React from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { BACK_PRIORITY, useBackHandler } from "../../hooks/useBackHandler";
import type { TranslateFn } from "../../types";
import type { ConsoleMenuItem, ConsoleMenuLevel } from "./constants";
import { useConsolePrefs } from "../../utils/consolePrefs";

export type MenuItemData = ConsoleMenuItem;

export interface FullscreenQuickMenuProps {
  isMenuOpen: boolean;
  onClose: () => void;
  updater?: { currentVersion?: string } | null;
  clock: string;
  /** Entries of the active (focused) level */
  menuItems: MenuItemData[];
  safeMenuIndex: number;
  setMenuFocusedIndex: (idx: number) => void;
  soundEffects: { playSelect: () => void };
  t: TranslateFn;
  menuSectionLabelKeys: Record<string, string>;
  menuItemRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  /** Full navigation stack (root → settings → category); enables sub menus and detail panels */
  levels?: ConsoleMenuLevel[];
  /** Back one level (closes the menu from the root level) */
  onBack?: () => void;
  /** Click on an entry of the parent list while its detail panel is open */
  onSelectParentItem?: (idx: number) => void;
}

const ACCENT = "var(--accent-primary, #38bdf8)";

/** Shared ◄ ► stepper buttons used by adjustable rows */
const StepButton: React.FC<{ dir: 1 | -1; onAdjust?: (dir: 1 | -1) => void }> = ({ dir, onAdjust }) => (
  <button
    type="button"
    aria-label={dir === 1 ? "next" : "previous"}
    className="p-0.5 hover:opacity-100 cursor-pointer bg-transparent border-none text-inherit inline-flex"
    onClick={(e) => {
      e.stopPropagation();
      onAdjust?.(dir);
    }}
  >
    {dir === 1 ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
  </button>
);

/** Right-hand control of a row in a settings detail panel */
const PanelControl: React.FC<{ item: MenuItemData; focused: boolean }> = ({ item, focused }) => {
  const kind = item.kind ?? "action";

  if (kind === "toggle") {
    return (
      <span
        role="checkbox"
        aria-checked={!!item.checked}
        className="w-6 h-6 rounded-[0.3rem] flex items-center justify-center shrink-0 transition-colors"
        style={{
          backgroundColor: item.checked ? ACCENT : "rgba(0, 0, 0, 0.35)",
          border: `2px solid ${item.checked ? ACCENT : focused ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.35)"}`,
          color: "#0b0f19",
        }}
      >
        {item.checked && <Check className="w-4 h-4" strokeWidth={3} />}
      </span>
    );
  }

  if (kind === "slider") {
    const pct = Math.round(Math.max(0, Math.min(1, item.progress ?? 0)) * 100);
    return (
      <span className="flex items-center gap-3 shrink-0">
        {focused && <StepButton dir={-1} onAdjust={item.onAdjust} />}
        <span className="w-12 text-right text-sm tabular-nums text-white/80">{item.value}</span>
        <span className="relative w-52 h-1.5 rounded-full bg-white/15">
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, backgroundColor: ACCENT }} />
          <span
            className="absolute top-1/2 w-2.5 h-5 rounded-sm bg-white shadow"
            style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
          />
        </span>
        {focused && <StepButton dir={1} onAdjust={item.onAdjust} />}
      </span>
    );
  }

  if (kind === "select") {
    return (
      <span
        className="flex items-center justify-between gap-2 min-w-[13rem] max-w-[18rem] px-3 py-1.5 rounded-[0.3rem] text-sm shrink-0"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.3)",
          border: `1px solid ${focused ? ACCENT : "rgba(255,255,255,0.3)"}`,
        }}
      >
        {focused && item.onAdjust ? <StepButton dir={-1} onAdjust={item.onAdjust} /> : <span className="w-5" />}
        <span className="flex-1 truncate text-center text-white">{item.value}</span>
        {focused && item.onAdjust ? <StepButton dir={1} onAdjust={item.onAdjust} /> : <span className="w-5" />}
      </span>
    );
  }

  return item.value ? <span className="text-sm text-white/60 shrink-0 max-w-[16rem] truncate">{item.value}</span> : null;
};

export const FullscreenQuickMenu: React.FC<FullscreenQuickMenuProps> = ({
  isMenuOpen,
  onClose,
  updater,
  clock,
  menuItems,
  safeMenuIndex,
  setMenuFocusedIndex,
  soundEffects,
  t,
  menuSectionLabelKeys,
  menuItemRefs,
  levels,
  onBack,
  onSelectParentItem,
}) => {
  useBackHandler(
    isMenuOpen,
    () => {
      soundEffects.playSelect();
      (onBack ?? onClose)();
    },
    BACK_PRIORITY.MENU
  );
  const { showClock } = useConsolePrefs();

  if (!isMenuOpen) return null;
  const visibleClock = showClock ? clock : null;

  const activeLevel = levels?.[levels.length - 1];
  const showPanel = !!levels && levels.length >= 2 && activeLevel?.layout === "panel";
  const sideLevel = showPanel ? levels![levels!.length - 2] : activeLevel;
  const sideItems = sideLevel?.items ?? menuItems;
  const sideIndex = sideLevel?.focusedIndex ?? safeMenuIndex;
  const sideTitle = sideLevel?.title;
  const panelParent = showPanel ? sideItems[sideIndex] : undefined;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="absolute inset-0 bg-black/55 omnis-fade-in cursor-pointer" onClick={onClose} />

      {/* SIDE LIST (root menu, or a sub menu such as Settings) */}
      <aside
        key={sideLevel?.id ?? "root"}
        className="relative h-full w-[26rem] max-w-[85vw] flex flex-col pt-8 pb-24 shadow-2xl omnis-slide-in-left"
        style={{ backgroundColor: "var(--bg-surface)" }}
      >
        {sideTitle ? (
          <div className="flex items-center justify-between gap-3 px-6 pb-6">
            <button
              type="button"
              onClick={() => {
                soundEffects.playSelect();
                onBack?.();
              }}
              className="flex items-center gap-2 min-w-0 bg-transparent border-none cursor-pointer text-white p-0"
            >
              <ChevronLeft className="w-7 h-7 shrink-0 text-white/60" />
              <span className="text-3xl font-light tracking-tight truncate">{sideTitle}</span>
            </button>
            {visibleClock && (
              <span className="text-lg font-medium tabular-nums text-white/60 shrink-0">{visibleClock}</span>
            )}
          </div>
        ) : (
          <div className="flex items-baseline justify-between px-8 pb-6">
            <span className="text-2xl font-bold tracking-tight text-white">
              Omnis
              {updater?.currentVersion && (
                <span className="ml-2 text-sm font-medium text-white/40">v{updater.currentVersion}</span>
              )}
            </span>
            {visibleClock && <span className="text-lg font-medium tabular-nums text-white/60">{visibleClock}</span>}
          </div>
        )}

        <ul className={`flex-1 overflow-y-auto no-scrollbar px-4 transition-opacity ${showPanel ? "opacity-60" : ""}`}>
          {sideItems.map((item, idx) => {
            const isFocused = idx === sideIndex;
            const isActive = isFocused && !showPanel;
            const Icon = item.icon;
            const sectionLabelKey =
              sideItems[idx - 1]?.section !== item.section ? menuSectionLabelKeys[item.section] : undefined;
            const danger = item.tone === "danger" || item.armed;
            const focusedStyle = danger
              ? { backgroundColor: "#e11d48", color: "#ffffff" }
              : { backgroundColor: "#ffffff", color: "#0b0f19" };
            const style: React.CSSProperties = isActive
              ? focusedStyle
              : isFocused
              ? { backgroundColor: "rgba(255, 255, 255, 0.12)", color: "#ffffff", boxShadow: `inset 0.2rem 0 0 ${ACCENT}` }
              : { color: item.tone === "accent" ? "#7dd3fc" : "rgba(255, 255, 255, 0.85)" };
            return (
              <React.Fragment key={item.id}>
                {sectionLabelKey && (
                  <li
                    className={`px-4 pb-2 text-xs font-semibold uppercase tracking-widest text-white/40 ${idx > 0 ? "pt-6" : ""}`}
                  >
                    {t(sectionLabelKey)}
                  </li>
                )}
                <li
                  ref={(el) => {
                    if (!showPanel) menuItemRefs.current[item.id] = el;
                  }}
                  onClick={() => {
                    soundEffects.playSelect();
                    if (showPanel) {
                      onSelectParentItem?.(idx);
                    } else {
                      setMenuFocusedIndex(idx);
                    }
                    item.onActivate();
                  }}
                  className="cursor-pointer flex items-center gap-4 px-4 py-3 rounded-md transition-colors duration-100"
                  style={style}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${item.spinning ? "animate-spin" : ""}`} />
                  <span className="flex-1 min-w-0 truncate text-base font-medium">{item.label}</span>
                  {item.value && (
                    <span className={`flex items-center gap-1 text-sm shrink-0 ${isActive ? "opacity-80" : "opacity-55"}`}>
                      {isActive && item.onAdjust && <StepButton dir={-1} onAdjust={item.onAdjust} />}
                      <span className="max-w-[13rem] truncate">{item.value}</span>
                      {isActive && item.onAdjust && <StepButton dir={1} onAdjust={item.onAdjust} />}
                    </span>
                  )}
                  {item.kind === "submenu" && (
                    <ChevronRight className={`w-5 h-5 shrink-0 ${isActive ? "opacity-80" : "opacity-40"}`} />
                  )}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      </aside>

      {/* DETAIL PANEL (settings of the selected category) */}
      {showPanel && activeLevel && (
        <section
          key={activeLevel.id}
          className="relative h-full flex-1 max-w-[46rem] flex flex-col pt-8 pb-24 shadow-2xl omnis-fade-in"
          style={{
            background: "linear-gradient(rgba(0,0,0,0.18), rgba(0,0,0,0.18)), var(--bg-surface)",
            borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div className="flex items-center gap-3 px-8 pb-6 text-white">
            {panelParent && <panelParent.icon className="w-6 h-6 text-white/70" />}
            <span className="text-2xl font-semibold tracking-tight">{activeLevel.title}</span>
          </div>

          <ul className="flex-1 overflow-y-auto no-scrollbar px-5 flex flex-col gap-1">
            {activeLevel.items.map((item, idx) => {
              const isFocused = idx === activeLevel.focusedIndex;
              const Icon = item.icon;
              return (
                <li
                  key={item.id}
                  ref={(el) => {
                    menuItemRefs.current[item.id] = el;
                  }}
                  onClick={() => {
                    setMenuFocusedIndex(idx);
                    soundEffects.playSelect();
                    item.onActivate();
                  }}
                  className="cursor-pointer flex items-center gap-4 px-4 py-3.5 rounded-md transition-colors duration-100"
                  style={
                    isFocused
                      ? { backgroundColor: "rgba(255, 255, 255, 0.1)", boxShadow: `inset 0 0 0 2px ${ACCENT}`, color: "#ffffff" }
                      : { color: "rgba(255, 255, 255, 0.85)" }
                  }
                >
                  <Icon className={`w-5 h-5 shrink-0 opacity-70 ${item.spinning ? "animate-spin" : ""}`} />
                  <span
                    className="flex-1 min-w-0 truncate text-base font-medium"
                    style={isFocused ? { color: ACCENT } : undefined}
                  >
                    {item.label}
                  </span>
                  <PanelControl item={item} focused={isFocused} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
};
