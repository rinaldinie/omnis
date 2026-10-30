import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { useTranslation } from "../../i18n";

export interface ResetStatisticsModalProps {
  isOpen: boolean;
  resetOption: "sessions" | "all";
  setResetOption: (option: "sessions" | "all") => void;
  resetting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ResetStatisticsModal({
  isOpen,
  resetOption,
  setResetOption,
  resetting,
  onClose,
  onConfirm,
}: ResetStatisticsModalProps) {
  const { t } = useTranslation();

  // Keyboard accessibility: dismiss modal on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !resetting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, resetting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !resetting) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-rose-400">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h3 id="reset-modal-title" className="text-base font-bold text-[var(--text-primary)]">
              {t("statistics.reset_title")}
            </h3>
          </div>
          <button
            onClick={() => !resetting && onClose()}
            disabled={resetting}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          {t("statistics.reset_confirm_msg")}
        </p>

        <div className="space-y-3">
          {/* Option 1: Sessions only */}
          <label
            className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
              resetOption === "sessions"
                ? "border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]"
                : "border-[var(--border-color)] opacity-80 hover:opacity-100"
            }`}
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            <input
              type="radio"
              name="resetOption"
              checked={resetOption === "sessions"}
              onChange={() => setResetOption("sessions")}
              className="mt-0.5"
            />
            <div className="text-xs">
              <span className="font-bold text-[var(--text-primary)] block">
                {t("statistics.reset_sessions_only")}
              </span>
              <span className="text-[11px] text-[var(--text-muted)] block mt-0.5">
                {t("statistics.reset_sessions_only_desc")}
              </span>
            </div>
          </label>

          {/* Option 2: Sessions and lifetime playtime of all games */}
          <label
            className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
              resetOption === "all"
                ? "border-rose-500 ring-1 ring-rose-500"
                : "border-[var(--border-color)] opacity-80 hover:opacity-100"
            }`}
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            <input
              type="radio"
              name="resetOption"
              checked={resetOption === "all"}
              onChange={() => setResetOption("all")}
              className="mt-0.5"
            />
            <div className="text-xs">
              <span className="font-bold text-rose-400 block">
                {t("statistics.reset_all_playtime")}
              </span>
              <span className="text-[11px] text-[var(--text-muted)] block mt-0.5">
                {t("statistics.reset_all_playtime_desc")}
              </span>
            </div>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={resetting}
            className="px-4 py-2 rounded-xl border text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
            }}
          >
            {t("statistics.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={resetting}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {resetting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span>{t("statistics.confirm")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
