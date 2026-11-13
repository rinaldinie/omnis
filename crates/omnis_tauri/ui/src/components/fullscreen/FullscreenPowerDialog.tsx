import React, { useState, useEffect, useRef } from "react";
import { Moon, RotateCw, Power, Monitor, LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TranslateFn } from "../../types";

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

  useEffect(() => {
    if (!isOpen) return;

    const count = options.length;

    const handleNav = (e: Event) => {
      const dir = (e as CustomEvent<{ direction?: "up" | "down" | "left" | "right" }>).detail?.direction;
      if (!dir) return;
      soundEffects.playNav();
      if (dir === "up") {
        setFocusedIndex((prev) => (prev - 1 + count) % count);
      } else if (dir === "down") {
        setFocusedIndex((prev) => (prev + 1) % count);
      }
    };

    const handleAction = () => {
      soundEffects.playSelect();
      const current = optionsRef.current[focusedIndexRef.current];
      if (current) {
        onSelectAction(current.id);
      }
    };

    const handleBack = (e: Event) => {
      e.preventDefault();
      soundEffects.playSelect();
      onClose();
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
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        soundEffects.playSelect();
        onClose();
      }
    };

    const events: Array<[string, EventListener]> = [
      ["omnis:menu-nav", handleNav],
      ["omnis:details-nav", handleNav],
      ["omnis:menu-action-a", handleAction],
      ["omnis:details-action-a", handleAction],
      ["omnis:menu-back", handleBack],
      ["omnis:details-back", handleBack],
    ];
    events.forEach(([name, fn]) => window.addEventListener(name, fn));
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      events.forEach(([name, fn]) => window.removeEventListener(name, fn));
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, options.length, onClose, onSelectAction, soundEffects]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[47] flex items-center justify-center bg-black/75 backdrop-blur-md omnis-fade-in">
      <div
        className="relative w-[34rem] max-w-[92vw] overflow-hidden rounded-2xl px-8 pt-8 pb-7 flex flex-col items-center shadow-2xl omnis-rise-in"
        style={{
          backgroundColor: "var(--bg-surface)",
          boxShadow: "0 30px 80px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-32 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at top, rgba(239, 68, 68, 0.22), transparent 70%)",
          }}
        />

        <div className="relative w-14 h-14 rounded-full flex items-center justify-center bg-rose-500/15 text-rose-400">
          <Power className="w-7 h-7" />
        </div>

        <h2 className="relative mt-4 text-2xl font-bold text-white tracking-tight">
          {t("console_ui.power_options")}
        </h2>
        <p className="relative mt-1 text-sm text-white/50 text-center">
          {t("console_ui.power_options_desc")}
        </p>

        <div className="relative mt-6 w-full flex flex-col gap-2.5">
          {options.map((item, idx) => {
            const isFocused = idx === focusedIndex;
            const Icon = item.icon;

            const activeBg =
              item.tone === "danger"
                ? "#e11d48"
                : item.tone === "warning"
                ? "#d97706"
                : item.tone === "accent"
                ? "#0284c7"
                : "#ffffff";
            const activeFg =
              item.tone === "danger" || item.tone === "warning" || item.tone === "accent"
                ? "#ffffff"
                : "#0b0f19";
            const activeDescFg =
              item.tone === "danger" || item.tone === "warning" || item.tone === "accent"
                ? "rgba(255, 255, 255, 0.85)"
                : "rgba(11, 15, 25, 0.75)";
            const activeShadow =
              item.tone === "danger"
                ? "0 10px 25px rgba(225, 29, 72, 0.35)"
                : item.tone === "warning"
                ? "0 10px 25px rgba(217, 119, 6, 0.35)"
                : item.tone === "accent"
                ? "0 10px 25px rgba(2, 132, 199, 0.35)"
                : "0 10px 25px rgba(0, 0, 0, 0.35)";

            const iconTint =
              item.tone === "danger"
                ? "#fb7185"
                : item.tone === "warning"
                ? "#fbbf24"
                : item.tone === "accent"
                ? "#38bdf8"
                : "rgba(255, 255, 255, 0.8)";

            return (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  soundEffects.playSelect();
                  onSelectAction(item.id);
                }}
                className="cursor-pointer w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-150 border-none text-left"
                style={
                  isFocused
                    ? {
                        backgroundColor: activeBg,
                        color: activeFg,
                        transform: "scale(1.02)",
                        boxShadow: activeShadow,
                      }
                    : {
                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                        color: "rgba(255, 255, 255, 0.9)",
                      }
                }
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: isFocused
                      ? "rgba(0, 0, 0, 0.15)"
                      : "rgba(255, 255, 255, 0.07)",
                    color: isFocused ? activeFg : iconTint,
                  }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold leading-tight">{item.label}</div>
                  <div
                    className="text-xs mt-0.5 truncate"
                    style={{
                      color: isFocused ? activeDescFg : "rgba(255, 255, 255, 0.45)",
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
