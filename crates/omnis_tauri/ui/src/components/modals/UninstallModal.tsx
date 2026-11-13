import React, { useState } from "react";
import { Trash2, X, CheckCircle2 } from "lucide-react";
import { GameDto, formatImageUrl } from "../../types";
import { useTranslation } from "../../i18n";
import { soundEffects } from "../../utils/soundEffects";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface UninstallModalProps {
  isOpen: boolean;
  game: GameDto | null;
  onClose: () => void;
  onConfirmUninstall: (gameId: string) => Promise<void>;
}

export const UninstallModal: React.FC<UninstallModalProps> = ({
  isOpen,
  game,
  onClose,
  onConfirmUninstall,
}) => {
  const { t } = useTranslation();
  const [isUninstalling, setIsUninstalling] = useState(false);

  if (!game) return null;

  const handleConfirm = async () => {
    soundEffects.playSelect();
    try {
      setIsUninstalling(true);
      await onConfirmUninstall(game.id);
      onClose();
    } catch (err) {
      console.error("Failed to uninstall game:", err);
    } finally {
      setIsUninstalling(false);
    }
  };

  const handleClose = () => {
    if (isUninstalling) return;
    soundEffects.playSelect();
    onClose();
  };

  const coverUrl = game.cover_image ? formatImageUrl(game.cover_image) : null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[10000] backdrop-blur-md"
        className="z-[10000] max-w-lg rounded-3xl p-0 flex flex-col overflow-hidden gap-0"
        onEscapeKeyDown={(e) => {
          if (isUninstalling) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (isUninstalling) e.preventDefault();
        }}
      >
        {/* Header */}
        <DialogHeader className="flex-row justify-between items-center px-6 py-4 border-b border-border shrink-0 space-y-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-md shrink-0">
              <Trash2 className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-black text-foreground">
                {t("uninstall_modal.title")}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground truncate mt-0.5">
                {game.library.toUpperCase()} • {game.title}
              </DialogDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleClose}
            disabled={isUninstalling}
            className="rounded-full text-muted-foreground hover:text-foreground shrink-0"
            aria-label={t("common.close")}
          >
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="flex gap-4 items-center p-3 rounded-2xl border border-border bg-black/30">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={game.title}
                className="w-16 h-20 object-cover rounded-xl shadow-md shrink-0 border border-white/10"
              />
            ) : (
              <div className="w-16 h-20 rounded-xl bg-slate-800 flex items-center justify-center text-white/50 text-xs font-bold shrink-0">
                {game.title.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h4 className="font-extrabold text-foreground text-sm truncate">
                {game.title}
              </h4>
              <p className="text-xs mt-0.5 text-muted-foreground">
                {t("common.details")}: {game.playtime_formatted} •{" "}
                {game.genres.slice(0, 2).join(", ") || "N/A"}
              </p>
              <Badge variant="secondary" className="mt-2">
                {game.library.toUpperCase()}
              </Badge>
            </div>
          </div>

          <p className="text-xs text-foreground/90 leading-relaxed font-medium">
            {t("uninstall_modal.confirm_msg", { title: game.title })}
          </p>

          {/* Reassurance Notice */}
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-emerald-200">
              {t("uninstall_modal.reassurance_note", {
                playtime: game.playtime_formatted,
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="flex-row items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0 sm:space-x-0">
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isUninstalling}
            className="px-6 py-2.5 h-auto font-bold shadow-lg shadow-rose-950/40"
          >
            <Trash2 className="w-4 h-4" />
            <span>
              {isUninstalling
                ? t("uninstall_modal.uninstalling")
                : t("uninstall_modal.uninstall_btn")}
            </span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={isUninstalling}
            className="px-5 py-2.5 h-auto font-bold"
          >
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
