import React from "react";
import { Monitor, Power, Trash2, Moon, RotateCw, LogOut } from "lucide-react";
import {
  CONSOLE_MODAL_SURFACE_STYLE,
  CONSOLE_OPTION_ACTIVE_STYLE,
  CONSOLE_OPTION_IDLE_STYLE,
} from "./constants";
import { GameDto, TranslateFn } from "../../types";

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
  t: TranslateFn;
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

  const Icon = KIND_ICON[confirm.kind];

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
    <div className="fixed inset-0 z-[48] flex items-center justify-center bg-black/75 backdrop-blur-md omnis-fade-in">
      <div
        className="relative w-[32rem] max-w-[90vw] overflow-hidden rounded-3xl px-10 pt-9 pb-8 flex flex-col items-center text-center omnis-rise-in"
        style={CONSOLE_MODAL_SURFACE_STYLE}
      >
        <div className="relative w-14 h-14 rounded-full flex items-center justify-center bg-white/10 border border-white/20 text-white">
          <Icon className="w-7 h-7" />
        </div>

        <h2 className="relative mt-5 text-2xl font-semibold uppercase tracking-wider text-white">
          {title}
        </h2>
        {description && <p className="relative mt-2 text-sm text-white/60">{description}</p>}

        <div className="relative mt-8 w-full flex flex-col gap-3">
          {(["confirm", "cancel"] as const).map((button) => {
            const isFocused = confirmFocus === button;

            return (
              <button
                type="button"
                key={button}
                onClick={() => {
                  soundEffects.playSelect();
                  onSelectButton(button);
                }}
                className={`cursor-pointer w-full flex items-center justify-center px-6 py-3.5 rounded-full text-base font-semibold uppercase tracking-wider transition-all duration-150 ${
                  isFocused ? "shadow-[0_10px_28px_rgba(0,0,0,0.45)]" : "hover:bg-white/10"
                }`}
                style={
                  isFocused
                    ? { ...CONSOLE_OPTION_ACTIVE_STYLE, transform: "scale(1.015)" }
                    : CONSOLE_OPTION_IDLE_STYLE
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
