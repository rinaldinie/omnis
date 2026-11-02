import React from "react";
import { GameDto } from "../../types";

export interface ConfirmState {
  kind: "exit" | "desktop" | "uninstall";
  game?: GameDto;
}

export interface FullscreenConfirmDialogProps {
  confirm: ConfirmState | null;
  confirmFocus: "cancel" | "confirm";
  onSelectButton: (button: "cancel" | "confirm") => void;
  soundEffects: { playSelect: () => void };
  t: (key: string, params?: Record<string, any>) => string;
}

export const FullscreenConfirmDialog: React.FC<FullscreenConfirmDialogProps> = ({
  confirm,
  confirmFocus,
  onSelectButton,
  soundEffects,
  t,
}) => {
  if (!confirm) return null;

  return (
    <div className="fixed inset-0 z-[45] flex items-center justify-center bg-black/60 omnis-fade-in">
      <div
        className="w-[30rem] max-w-[90vw] rounded-xl p-8 flex flex-col gap-6 shadow-2xl omnis-rise-in"
        style={{ backgroundColor: "var(--bg-surface)" }}
      >
        <div>
          <h2 className="text-2xl font-semibold text-white">
            {confirm.kind === "exit"
              ? t("console_ui.confirm_exit")
              : confirm.kind === "desktop"
              ? t("console_ui.confirm_desktop")
              : t("console_ui.confirm_uninstall", { title: confirm.game?.title ?? "" })}
          </h2>
          {confirm.kind === "uninstall" && (
            <p className="mt-2 text-base text-white/65">{t("console_ui.confirm_uninstall_desc")}</p>
          )}
        </div>
        <div className="flex justify-end gap-3">
          {(["cancel", "confirm"] as const).map((button) => {
            const isFocused = confirmFocus === button;
            const isDanger = button === "confirm" && confirm.kind !== "desktop";
            return (
              <button
                type="button"
                key={button}
                onClick={() => {
                  soundEffects.playSelect();
                  onSelectButton(button);
                }}
                className="cursor-pointer px-6 py-3 rounded-md text-base font-semibold uppercase tracking-wider transition-all duration-150 border-none"
                style={
                  isFocused
                    ? {
                        backgroundColor: isDanger ? "#e11d48" : "#ffffff",
                        color: isDanger ? "#ffffff" : "#0b0f19",
                        transform: "scale(1.04)",
                      }
                    : { backgroundColor: "rgba(255, 255, 255, 0.1)", color: "rgba(255, 255, 255, 0.85)" }
                }
              >
                {button === "cancel"
                  ? t("common.cancel")
                  : confirm.kind === "exit"
                  ? t("console_ui.exit")
                  : confirm.kind === "desktop"
                  ? t("console_ui.desktop_mode")
                  : t("console_ui.action_uninstall")}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
