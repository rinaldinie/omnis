import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslation } from "../../i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

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

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !resetting) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-w-md w-full bg-card border-border rounded-2xl p-6 gap-5"
        closeButtonDisabled={resetting}
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2.5 text-base font-bold text-foreground">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{t("statistics.reset_title")}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
            {t("statistics.reset_confirm_msg")}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={resetOption}
          onValueChange={(val) => setResetOption(val as "sessions" | "all")}
          className="space-y-3 gap-0"
        >
          {/* Option 1: Sessions only */}
          <label
            htmlFor="reset-option-sessions"
            className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all bg-popover ${
              resetOption === "sessions"
                ? "border-primary ring-1 ring-primary"
                : "border-border opacity-80 hover:opacity-100"
            }`}
          >
            <RadioGroupItem
              id="reset-option-sessions"
              value="sessions"
              className="mt-0.5 shrink-0"
            />
            <div className="text-xs">
              <span className="font-bold text-foreground block">
                {t("statistics.reset_sessions_only")}
              </span>
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                {t("statistics.reset_sessions_only_desc")}
              </span>
            </div>
          </label>

          {/* Option 2: Sessions and lifetime playtime of all games */}
          <label
            htmlFor="reset-option-all"
            className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all bg-popover ${
              resetOption === "all"
                ? "border-rose-500 ring-1 ring-rose-500"
                : "border-border opacity-80 hover:opacity-100"
            }`}
          >
            <RadioGroupItem
              id="reset-option-all"
              value="all"
              className="mt-0.5 shrink-0 data-[state=checked]:border-rose-500 text-rose-500"
            />
            <div className="text-xs">
              <span className="font-bold text-rose-400 block">
                {t("statistics.reset_all_playtime")}
              </span>
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                {t("statistics.reset_all_playtime_desc")}
              </span>
            </div>
          </label>
        </RadioGroup>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={resetting}
          >
            {t("statistics.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={resetting}
            className="font-bold"
          >
            {resetting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span>{t("statistics.confirm")}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
