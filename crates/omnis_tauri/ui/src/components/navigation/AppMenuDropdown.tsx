import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Palette,
  Puzzle,
  PlusCircle,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import soundEffects from "../../utils/soundEffects";

export interface AppMenuDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  onOpenThemeModal: () => void;
  onOpenPluginModal: () => void;
  onOpenAddCustomModal: () => void;
  onOpenBatchEnrichModal: () => void;
  onToggleSound: () => void;
  soundEnabled: boolean;
  hasActiveProviders?: boolean;
  t?: (key: string, params?: Record<string, any>) => string;
}

export default function AppMenuDropdown({
  isOpen,
  onClose,
  triggerRef,
  onOpenThemeModal,
  onOpenPluginModal,
  onOpenAddCustomModal,
  onOpenBatchEnrichModal,
  onToggleSound,
  soundEnabled,
  hasActiveProviders = false,
  t,
}: AppMenuDropdownProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  // Reset active index whenever menu opens
  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
    }
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        if (triggerRef?.current && triggerRef.current.contains(target)) {
          return;
        }
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose, triggerRef]);

  const menuItems = useMemo(
    () => [
      {
        id: "themes",
        label: t ? t("topbar.themes") : "Temi",
        icon: <Palette className="w-4 h-4 shrink-0" style={{ color: "var(--accent-primary)" }} />,
        action: () => {
          soundEffects.playSelect();
          onOpenThemeModal();
          onClose();
        },
      },
      {
        id: "plugins",
        label: t ? t("topbar.plugins") : "Plugin",
        icon: <Puzzle className="w-4 h-4 text-indigo-400 shrink-0" />,
        badge: hasActiveProviders ? (
          <span
            className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"
            title="Active providers configured"
          />
        ) : null,
        action: () => {
          soundEffects.playSelect();
          onOpenPluginModal();
          onClose();
        },
      },
      {
        id: "add-custom",
        label: t ? t("topbar.add_game") : "Aggiungi Gioco",
        icon: <PlusCircle className="w-4 h-4 text-emerald-400 shrink-0" />,
        action: () => {
          soundEffects.playSelect();
          onOpenAddCustomModal();
          onClose();
        },
      },
      {
        id: "batch-enrich",
        label: t ? t("topbar.enrich_button") : "Sincronizza Metadati Batch",
        icon: <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />,
        action: () => {
          soundEffects.playSelect();
          onOpenBatchEnrichModal();
          onClose();
        },
      },
      {
        id: "sound-fx",
        dividerBefore: true,
        label: t ? t("topbar.audio_ui") : "Effetti Audio",
        icon: soundEnabled ? (
          <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <VolumeX className="w-4 h-4 text-slate-400 shrink-0" />
        ),
        badge: (
          <span
            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
              soundEnabled
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "bg-white/5 text-slate-400 border border-white/10"
            }`}
          >
            {soundEnabled ? (t ? t("topbar.audio_on") : "ON") : (t ? t("topbar.audio_off") : "OFF")}
          </span>
        ),
        action: () => {
          soundEffects.playSelect();
          onToggleSound();
        },
      },
    ],
    [
      t,
      onOpenThemeModal,
      onClose,
      hasActiveProviders,
      onOpenPluginModal,
      onOpenAddCustomModal,
      onOpenBatchEnrichModal,
      soundEnabled,
      onToggleSound,
    ]
  );

  // Focus active item when activeIndex changes or menu opens
  useEffect(() => {
    if (isOpen) {
      menuRef.current
        ?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
        [activeIndex]?.focus();
    }
  }, [isOpen, activeIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        triggerRef?.current?.focus();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        soundEffects.playNav();
        setActiveIndex((prev) => (prev + 1) % menuItems.length);
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        soundEffects.playNav();
        setActiveIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
        return;
      }

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const activeItem = menuItems[activeIndex];
        if (activeItem) {
          activeItem.action();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, activeIndex, onClose, triggerRef, menuItems]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-orientation="vertical"
      aria-label="Omnis Application Menu"
      data-no-drag="true"
      className="absolute left-2 top-[calc(100%+6px)] min-w-[240px] rounded-xl border p-1.5 shadow-2xl backdrop-blur-md z-50 omnis-rise-in select-none"
      style={{
        backgroundColor: "var(--surface-overlay, rgba(14, 19, 32, 0.95))",
        borderColor: "var(--border-subtle, rgba(255, 255, 255, 0.1))",
        boxShadow: "0 20px 40px -8px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)",
      }}
    >
      {menuItems.map((item, idx) => (
        <React.Fragment key={item.id}>
          {item.dividerBefore && (
            <div
              className="my-1 border-t"
              style={{ borderColor: "var(--border-subtle, rgba(255, 255, 255, 0.08))" }}
            />
          )}
          <button
            type="button"
            role="menuitem"
            tabIndex={activeIndex === idx ? 0 : -1}
            onClick={item.action}
            onMouseEnter={() => setActiveIndex(idx)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-left cursor-pointer group ${
              activeIndex === idx
                ? "bg-white/10 text-white"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="shrink-0 flex items-center justify-center">
                {item.icon}
              </div>
              <span className="truncate">{item.label}</span>
            </div>
            {item.badge && <div className="shrink-0 ml-2">{item.badge}</div>}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
