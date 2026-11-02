import React, { useState } from "react";
import { LogOut, Database, HardDrive, Trash2, Loader2, AlertTriangle, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import { soundEffects } from "../../utils/soundEffects";

export type StoreCleanupMode = "keep" | "uninstalled_only" | "all";

interface DisconnectStoreModalProps {
  isOpen: boolean;
  storeId: string;
  storeName: string;
  onClose: () => void;
  onConfirm: (storeId: string, cleanupMode: StoreCleanupMode) => Promise<void>;
}

export const DisconnectStoreModal: React.FC<DisconnectStoreModalProps> = ({
  isOpen,
  storeId,
  storeName,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [selectedMode, setSelectedMode] = useState<StoreCleanupMode>("keep");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    soundEffects.playSelect();
    try {
      setIsSubmitting(true);
      await onConfirm(storeId, selectedMode);
      onClose();
    } catch (e) {
      console.error("Disconnect failed:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const options: Array<{
    mode: StoreCleanupMode;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    desc: string;
    accent: string;
  }> = [
    {
      mode: "keep",
      icon: Database,
      title: t("store_accounts.cleanup_keep_title"),
      desc: t("store_accounts.cleanup_keep_desc"),
      accent: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    },
    {
      mode: "uninstalled_only",
      icon: HardDrive,
      title: t("store_accounts.cleanup_uninstalled_title"),
      desc: t("store_accounts.cleanup_uninstalled_desc"),
      accent: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    },
    {
      mode: "all",
      icon: Trash2,
      title: t("store_accounts.cleanup_all_title"),
      desc: t("store_accounts.cleanup_all_desc"),
      accent: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    },
  ];

  return (
    <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div
        className="relative max-w-lg w-full rounded-3xl border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
        }}
      >
        {/* Header */}
        <div
          className="flex justify-between items-center px-6 py-4 border-b shrink-0"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-md">
              <LogOut className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">
                {t("store_accounts.disconnect_modal_title", { store: storeName })}
              </h3>
              <p className="text-xs text-slate-400">
                {storeName.toUpperCase()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEffects.playSelect();
              onClose();
            }}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-slate-300 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>{t("store_accounts.disconnect_modal_desc", { store: storeName })}</span>
          </div>

          <div className="space-y-2.5">
            {options.map((opt) => {
              const Icon = opt.icon;
              const isSelected = selectedMode === opt.mode;
              return (
                <div
                  key={opt.mode}
                  onClick={() => {
                    soundEffects.playNav();
                    setSelectedMode(opt.mode);
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                    isSelected
                      ? `${opt.accent} shadow-md`
                      : "border-white/10 bg-black/20 hover:bg-white/[0.04] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="cleanup_mode"
                    checked={isSelected}
                    onChange={() => setSelectedMode(opt.mode)}
                    className="mt-1 w-4 h-4 text-sky-500 cursor-pointer"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-bold text-white">{opt.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal">{opt.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-black/40 shrink-0"
          style={{ borderColor: "var(--border-color)" }}
        >
          <button
            type="button"
            onClick={() => {
              soundEffects.playSelect();
              onClose();
            }}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
          >
            {t("store_accounts.cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            <span>{t("store_accounts.confirm_disconnect")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
