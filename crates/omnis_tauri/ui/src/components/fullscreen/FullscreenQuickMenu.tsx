import React from "react";
import { ChevronLeft, ChevronRight, LucideIcon } from "lucide-react";

export interface MenuItemData {
  id: string;
  section: string;
  icon: LucideIcon;
  tone?: "accent" | "danger" | "default";
  spinning?: boolean;
  label: string;
  value?: string;
  onAdjust?: (dir: 1 | -1) => void;
  onActivate: () => void;
}

export interface FullscreenQuickMenuProps {
  isMenuOpen: boolean;
  onClose: () => void;
  updater?: { currentVersion?: string } | null;
  clock: string;
  menuItems: MenuItemData[];
  safeMenuIndex: number;
  setMenuFocusedIndex: (idx: number) => void;
  soundEffects: { playSelect: () => void };
  t: (key: string, params?: Record<string, any>) => string;
  menuSectionLabelKeys: Record<string, string>;
  menuItemRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
}

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
}) => {
  if (!isMenuOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="absolute inset-0 bg-black/55 omnis-fade-in cursor-pointer"
        onClick={onClose}
      />
      <aside
        className="relative h-full w-[26rem] max-w-[85vw] flex flex-col pt-8 pb-24 shadow-2xl omnis-slide-in-left"
        style={{ backgroundColor: "var(--bg-surface)" }}
      >
        <div className="flex items-baseline justify-between px-8 pb-6">
          <span className="text-2xl font-bold tracking-tight text-white">
            Omnis
            {updater?.currentVersion && (
              <span className="ml-2 text-sm font-medium text-white/40">v{updater.currentVersion}</span>
            )}
          </span>
          <span className="text-lg font-medium tabular-nums text-white/60">{clock}</span>
        </div>

        <ul className="flex-1 overflow-y-auto no-scrollbar px-4">
          {menuItems.map((item, idx) => {
            const isFocused = idx === safeMenuIndex;
            const Icon = item.icon;
            const sectionLabelKey =
              menuItems[idx - 1]?.section !== item.section ? menuSectionLabelKeys[item.section] : undefined;
            const focusedStyle =
              item.tone === "danger"
                ? { backgroundColor: "#e11d48", color: "#ffffff" }
                : { backgroundColor: "#ffffff", color: "#0b0f19" };
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
                    menuItemRefs.current[item.id] = el;
                  }}
                  onClick={() => {
                    setMenuFocusedIndex(idx);
                    soundEffects.playSelect();
                    item.onActivate();
                  }}
                  className="cursor-pointer flex items-center gap-4 px-4 py-3 rounded-md transition-colors duration-100"
                  style={
                    isFocused
                      ? focusedStyle
                      : { color: item.tone === "accent" ? "#7dd3fc" : "rgba(255, 255, 255, 0.85)" }
                  }
                >
                  <Icon className={`w-5 h-5 shrink-0 ${item.spinning ? "animate-spin" : ""}`} />
                  <span className="flex-1 min-w-0 truncate text-base font-medium">{item.label}</span>
                  {item.value && (
                    <span className={`flex items-center gap-1 text-sm shrink-0 ${isFocused ? "opacity-80" : "opacity-55"}`}>
                      {isFocused && item.onAdjust && (
                        <button
                          type="button"
                          className="p-0.5 hover:opacity-100 cursor-pointer bg-transparent border-none text-inherit inline-flex"
                          onClick={(e) => {
                            e.stopPropagation();
                            item.onAdjust?.(-1);
                          }}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                      )}
                      <span className="max-w-[13rem] truncate">{item.value}</span>
                      {isFocused && item.onAdjust && (
                        <button
                          type="button"
                          className="p-0.5 hover:opacity-100 cursor-pointer bg-transparent border-none text-inherit inline-flex"
                          onClick={(e) => {
                            e.stopPropagation();
                            item.onAdjust?.(1);
                          }}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      )}
                    </span>
                  )}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      </aside>
    </div>
  );
};
