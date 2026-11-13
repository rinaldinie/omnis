import React from "react";
import { Monitor, Power, Trash2, Moon, RotateCw, LogOut } from "lucide-react";
import { GameDto } from "../../types";

export type ConfirmKind = "exit" | "desktop" | "uninstall" | "sleep" | "restart" | "shutdown";

export interface ConfirmState {
  kind: ConfirmKind;
  game?: GameDto;
}

export interface FullscreenConfirmDialogProps {
  confirm: ConfirmState | null;
  confirmFocus: "cancel" | "confirm";
  onSelectButton: (button: "cancel" | "confirm") => void;
  soundEffects: { playSelect: () => void };
  t: (key: string, params?: Record<string, any>) => string;
}

const KIND_ICON = {
  exit: LogOut,
  desktop: Monitor,
  uninstall: Trash2,
  sleep: Moon,
  restart: RotateCw,
  shutdown: Power,
} as const;

/** Console confirmation sheet: full-width stacked actions, confirm on top, cancel focused by default. */
export const FullscreenConfirmDialog: React.FC<FullscreenConfirmDialogProps> = ({
  confirm,
  confirmFocus,
  onSelectButton,
  soundEffects,
  t,
}) => {
  if (!confirm) return null;

  const isDanger = confirm.kind === "shutdown" || confirm.kind === "uninstall" || confirm.kind === "exit";
  const isWarning = confirm.kind === "restart";
  const isSleep = confirm.kind === "sleep";
  const Icon = KIND_ICON[confirm.kind];
  const tint = isDanger
    ? "#fb7185"
    : isWarning
    ? "#fbbf24"
    : isSleep
    ? "#38bdf8"
    : "var(--accent-primary)";

  const title =
    confirm.kind === "exit"
      ? t("console_ui.confirm_exit")
      : confirm.kind === "desktop"
      ? t("console_ui.confirm_desktop")
      : confirm.kind === "sleep"
      ? t("console_ui.confirm_sleep")
      : confirm.kind === "restart"
      ? t("console_ui.confirm_restart")
      : confirm.kind === "shutdown"
      ? t("console_ui.confirm_shutdown")
      : t("console_ui.confirm_uninstall", { title: confirm.game?.title ?? "" });

  const description =
    confirm.kind === "exit"
      ? t("fullscreen.exit_app_desc")
      : confirm.kind === "sleep"
      ? t("console_ui.confirm_sleep_desc")
      : confirm.kind === "restart"
      ? t("console_ui.confirm_restart_desc")
      : confirm.kind === "shutdown"
      ? t("console_ui.confirm_shutdown_desc")
      : confirm.kind === "uninstall"
      ? t("console_ui.confirm_uninstall_desc")
      : null;

  const confirmLabel =
    confirm.kind === "exit"
      ? t("console_ui.exit")
      : confirm.kind === "desktop"
      ? t("console_ui.desktop_mode")
      : confirm.kind === "sleep"
      ? t("console_ui.sleep")
      : confirm.kind === "restart"
      ? t("console_ui.restart")
      : confirm.kind === "shutdown"
      ? t("console_ui.shutdown")
      : t("console_ui.action_uninstall");

  return (
    <div className="fixed inset-0 z-[48] flex items-center justify-center bg-black/70 backdrop-blur-md omnis-fade-in">
      <div
        className="relative w-[32rem] max-w-[90vw] overflow-hidden rounded-2xl px-10 pt-10 pb-8 flex flex-col items-center text-center shadow-2xl omnis-rise-in"
        style={{
          backgroundColor: "var(--bg-surface)",
          boxShadow: "0 30px 80px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-32 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at top, color-mix(in srgb, ${tint} 22%, transparent), transparent 70%)` }}
        />

        <div
          className="relative w-16 h-16 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `color-mix(in srgb, ${tint} 16%, transparent)`, color: tint }}
        >
          <Icon className="w-8 h-8" />
        </div>

        <h2 className="relative mt-6 text-3xl font-bold text-white tracking-tight">{title}</h2>
        {description && <p className="relative mt-2 text-base text-white/60">{description}</p>}

        <div className="relative mt-8 w-full flex flex-col gap-3">
          {(["confirm", "cancel"] as const).map((button) => {
            const isFocused = confirmFocus === button;
            const isConfirmButton = button === "confirm";
            const danger = isConfirmButton && isDanger;
            const warning = isConfirmButton && isWarning;
            const sleep = isConfirmButton && isSleep;

            const activeBg = danger
              ? "#e11d48"
              : warning
              ? "#d97706"
              : sleep
              ? "#0284c7"
              : "#ffffff";
            const activeFg = danger || warning || sleep ? "#ffffff" : "#0b0f19";
            const activeShadow = danger
              ? "0 10px 30px rgba(225, 29, 72, 0.35)"
              : warning
              ? "0 10px 30px rgba(217, 119, 6, 0.35)"
              : sleep
              ? "0 10px 30px rgba(2, 132, 199, 0.35)"
              : "0 10px 30px rgba(0, 0, 0, 0.35)";

            return (
              <button
                type="button"
                key={button}
                onClick={() => {
                  soundEffects.playSelect();
                  onSelectButton(button);
                }}
                className="cursor-pointer w-full flex items-center justify-center px-6 py-4 rounded-lg text-lg font-semibold uppercase tracking-wider transition-all duration-150 border-none"
                style={
                  isFocused
                    ? {
                        backgroundColor: activeBg,
                        color: activeFg,
                        transform: "scale(1.02)",
                        boxShadow: activeShadow,
                      }
                    : { backgroundColor: "rgba(255, 255, 255, 0.07)", color: "rgba(255, 255, 255, 0.8)" }
                }
              >
                {button === "cancel" ? t("common.cancel") : confirmLabel}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
