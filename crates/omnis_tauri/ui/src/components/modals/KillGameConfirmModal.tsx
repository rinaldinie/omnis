import React from "react";
import { AlertTriangle, Square } from "lucide-react";
import type { ActiveGameSession } from "../../types";

interface KillGameConfirmModalProps {
  isOpen: boolean;
  activeGame: ActiveGameSession | null;
  onClose: () => void;
  onConfirm: () => void;
  t: (key: string, params?: Record<string, any>) => string;
}

export const KillGameConfirmModal: React.FC<KillGameConfirmModalProps> = ({
  isOpen,
  activeGame,
  onClose,
  onConfirm,
  t,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-sm rounded-2xl border p-5 shadow-2xl space-y-4"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              {t("app_misc.kill_modal_title")}
            </h3>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {activeGame?.title || t("app_misc.this_game")}
            </p>
          </div>
        </div>

        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {t("app_misc.kill_modal_body")}
        </p>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-white/10 transition-colors cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            {t("app_misc.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-600/30"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>{t("app_misc.kill_confirm")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
