import React, { useState, useEffect, useRef } from "react";
import { Moon, RotateCw, Power, Monitor, LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TranslateFn } from "../../types";
import { BACK_PRIORITY, useBackHandler } from "../../hooks/useBackHandler";
import {
  CONSOLE_MODAL_SURFACE_STYLE,
  CONSOLE_OPTION_ACTIVE_STYLE,
  CONSOLE_OPTION_IDLE_STYLE,
} from "./constants";

export type PowerActionId = "sleep" | "restart" | "shutdown" | "desktop" | "exit";

export interface PowerOptionItem {
  id: PowerActionId;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: "accent" | "warning" | "danger" | "default";
}

export interface FullscreenPowerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (actionId: PowerActionId) => void;
  soundEffects: { playSelect: () => void; playNav: () => void };
  t: TranslateFn;
}

export const FullscreenPowerDialog: React.FC<FullscreenPowerDialogProps> = ({
  isOpen,
  onClose,
  onSelectAction,
  soundEffects,
  t,
}) => {
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;

  const options: PowerOptionItem[] = [
    {
      id: "sleep",
      label: t("console_ui.sleep"),
      description: t("console_ui.sleep_desc"),
      icon: Moon,
      tone: "accent",
    },
    {
      id: "restart",
      label: t("console_ui.restart"),
      description: t("console_ui.restart_desc"),
      icon: RotateCw,
      tone: "warning",
    },
    {
      id: "shutdown",
      label: t("console_ui.shutdown"),
      description: t("console_ui.shutdown_desc"),
      icon: Power,
      tone: "danger",
    },
    {
      id: "desktop",
      label: t("console_ui.desktop_mode"),
      description: t("console_ui.desktop_desc"),
      icon: Monitor,
      tone: "default",
    },
    {
      id: "exit",
      label: t("console_ui.exit"),
      description: t("console_ui.exit_desc"),
      icon: LogOut,
      tone: "default",
    },
  ];
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Reset focus to top option whenever dialog opens
  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(0);
    }
  }, [isOpen]);

  useBackHandler(
    isOpen,
    () => {
      soundEffects.playSelect();
      onClose();
    },
    BACK_PRIORITY.POWER_DIALOG
  );

  useEffect(() => {
    if (!isOpen) return;

    const count = options.length;

    const handleNav = (e: Event) => {
      e.preventDefault();
      const dir = (e as CustomEvent<{ direction?: "up" | "down" | "left" | "right" }>).detail?.direction;
      if (!dir) return;
      soundEffects.playNav();
      if (dir === "up") {
        setFocusedIndex((prev) => (prev - 1 + count) % count);
      } else if (dir === "down") {
        setFocusedIndex((prev) => (prev + 1) % count);
      }
    };

    const handleAction = (e?: Event) => {
      e?.preventDefault();
      soundEffects.playSelect();
      const current = optionsRef.current[focusedIndexRef.current];
      if (current) {
        onSelectAction(current.id);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        soundEffects.playNav();
        setFocusedIndex((prev) => (prev - 1 + count) % count);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        soundEffects.playNav();
        setFocusedIndex((prev) => (prev + 1) % count);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        handleAction();
      }
    };

    const events: Array<[string, EventListener]> = [
      ["omnis:overlay-nav", handleNav],
      ["omnis:overlay-action-a", handleAction],
      ["omnis:menu-nav", handleNav],
      ["omnis:details-nav", handleNav],
      ["omnis:menu-action-a", handleAction],
      ["omnis:details-action-a", handleAction],
    ];
    events.forEach(([name, fn]) => window.addEventListener(name, fn));
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      events.forEach(([name, fn]) => window.removeEventListener(name, fn));
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, options.length, onSelectAction, soundEffects]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[47] flex items-center justify-center bg-black/75 backdrop-blur-md omnis-fade-in">
      <div
        className="relative w-[34rem] max-w-[92vw] overflow-hidden rounded-3xl px-8 pt-8 pb-7 flex flex-col items-center omnis-rise-in"
        style={CONSOLE_MODAL_SURFACE_STYLE}
      >
        <div className="relative w-14 h-14 rounded-full flex items-center justify-center bg-white/10 border border-white/20 text-white">
          <Power className="w-7 h-7" />
        </div>

        <h2 className="relative mt-4 text-2xl font-semibold uppercase tracking-wider text-white text-center">
          {t("console_ui.power_options")}
        </h2>
        <p className="relative mt-1.5 text-sm text-white/60 text-center">
          {t("console_ui.power_options_desc")}
        </p>

        <div className="relative mt-6 w-full flex flex-col gap-3">
          {options.map((item, idx) => {
            const isFocused = idx === focusedIndex;
            const Icon = item.icon;

            return (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  soundEffects.playSelect();
                  onSelectAction(item.id);
                }}
                className={`cursor-pointer w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl transition-all duration-150 text-left ${
                  isFocused ? "shadow-[0_10px_28px_rgba(0,0,0,0.45)]" : "hover:bg-white/10"
                }`}
                style={
                  isFocused
                    ? { ...CONSOLE_OPTION_ACTIVE_STYLE, transform: "scale(1.015)" }
                    : CONSOLE_OPTION_IDLE_STYLE
                }
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: isFocused
                      ? "rgba(11, 15, 25, 0.08)"
                      : "rgba(255, 255, 255, 0.08)",
                    border: isFocused
                      ? "1px solid rgba(11, 15, 25, 0.14)"
                      : "1px solid rgba(255, 255, 255, 0.14)",
                    color: isFocused ? "#0b0f19" : "#f8fafc",
                  }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold uppercase tracking-wider leading-tight">
                    {item.label}
                  </div>
                  <div
                    className="text-xs mt-1 truncate"
                    style={{
                      color: isFocused ? "rgba(11, 15, 25, 0.72)" : "rgba(255, 255, 255, 0.6)",
                    }}
                  >
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
