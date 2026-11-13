import React from "react";
import { RotateCcw, ImageIcon, Layers, Loader2, Check } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { soundEffects } from "../../../utils/soundEffects";
import type { BackupInspectionDto } from "../../../types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface RestoreConfirmModalProps {
  isOpen: boolean;
  inspection: BackupInspectionDto | null;
  isRestoring: boolean;
  onClose: () => void;
  onConfirm: () => void;
  formatDate: (isoDate?: string | null) => string;
}

export const RestoreConfirmModal: React.FC<RestoreConfirmModalProps> = ({
  isOpen,
  inspection,
  isRestoring,
  onClose,
  onConfirm,
  formatDate,
}) => {
  const { t } = useTranslation();

  if (!inspection) return null;

  const handleClose = () => {
    if (isRestoring) return;
    soundEffects.playSelect();
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[60] bg-black/85 backdrop-blur-md"
        className="z-[60] max-w-lg rounded-3xl p-6 gap-0 space-y-6"
        onEscapeKeyDown={(e) => {
          if (isRestoring) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (isRestoring) e.preventDefault();
        }}
      >
        <DialogHeader className="flex-row items-center gap-3 border-b border-border pb-4 space-y-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center border shrink-0"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
              borderColor:
                "color-mix(in srgb, var(--accent-primary) 30%, transparent)",
              color: "var(--accent-primary)",
            }}
          >
            <RotateCcw className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-base font-black text-foreground">
              {t("backup_settings.confirm_modal_title") ||
                "Conferma Ripristino Backup (.zip)"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400 mt-0.5">
              {t("backup_settings.confirm_modal_desc") ||
                "Verifica i dati estratti dall'archivio prima di procedere"}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* INSPECTION DETAILS GRID */}
        <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">
              {t("backup_settings.details_date") || "Data Creazione:"}
            </span>
            <span className="font-semibold text-foreground">
              {formatDate(inspection.created_at_utc)}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">
              {t("backup_settings.details_version") || "Versione Omnis:"}
            </span>
            <span className="font-semibold text-foreground">
              v{inspection.omnis_version}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">
              {t("backup_settings.details_hostname") || "Host di Origine:"}
            </span>
            <span className="font-semibold text-foreground">
              {inspection.hostname}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">
              {t("backup_settings.details_games") || "Giochi nel Backup:"}
            </span>
            <span className="font-bold text-sky-400 text-sm">
              {inspection.total_games}
            </span>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-300">
              {t("backup_settings.details_artwork") || "Artwork:"}{" "}
              <strong>
                {inspection.has_artwork
                  ? t("backup_settings.details_artwork_included") || "Inclusi"
                  : t("backup_settings.details_artwork_missing") || "Assenti"}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-300">
              {t("backup_settings.details_themes") || "Temi:"}{" "}
              <strong>
                {inspection.custom_themes_count}{" "}
                {t("backup_settings.details_themes_custom") || "personalizzati"}
              </strong>
            </span>
          </div>
        </div>

        <p className="text-[11px] text-amber-300 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 leading-relaxed">
          {t("backup_settings.confirm_warning_note", {
            count: inspection.total_games,
          }) ||
            `Cliccando su "Ripristina Ora", il database locale verrà sostituito con i ${inspection.total_games} giochi contenuti in questo backup.`}
        </p>

        {/* MODAL ACTIONS */}
        <DialogFooter className="flex-row items-center justify-end gap-3 pt-2 sm:space-x-0">
          <Button
            type="button"
            variant="ghost"
            disabled={isRestoring}
            onClick={handleClose}
            className="font-bold"
          >
            {t("backup_settings.btn_cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button
            type="button"
            disabled={isRestoring}
            onClick={onConfirm}
            className="px-6 py-2.5 h-auto font-bold shadow-lg"
            style={{
              boxShadow: "0 4px 14px var(--accent-glow)",
            }}
          >
            {isRestoring ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>
                  {t("backup_settings.restoring_backup") ||
                    "Ripristino in corso..."}
                </span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>
                  {t("backup_settings.btn_restore_now") || "Ripristina Ora"}
                </span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
