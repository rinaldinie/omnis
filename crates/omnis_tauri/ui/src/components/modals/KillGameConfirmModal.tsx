import React from "react";
import { AlertTriangle, Square } from "lucide-react";
import type { ActiveGameSession } from "../../types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-sm rounded-2xl p-5 gap-4 space-y-0"
      >
        <DialogHeader className="flex-row items-center gap-3 space-y-0">
          <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-sm font-bold text-foreground">
              {t("app_misc.kill_modal_title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground truncate mt-0.5">
              {activeGame?.title || t("app_misc.this_game")}
            </DialogDescription>
          </div>
        </DialogHeader>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("app_misc.kill_modal_body")}
        </p>

        <DialogFooter className="flex-row justify-end gap-2 pt-2 sm:space-x-0">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t("app_misc.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            className="font-bold shadow-md shadow-rose-600/30"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>{t("app_misc.kill_confirm")}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
