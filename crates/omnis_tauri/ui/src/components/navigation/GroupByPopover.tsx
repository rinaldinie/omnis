import React from "react";
import {
  Layers,
  X,
  Ban,
  CheckCircle2,
  Gamepad2,
  HardDrive,
  Sparkles,
  Code2,
  Calendar,
} from "lucide-react";
import { GroupBy } from "../../types";
import { useTranslation } from "../../i18n";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ActionTooltip } from "@/components/ui/tooltip";

export interface GroupByPopoverProps {
  trigger: React.ReactNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  groupBy: GroupBy;
  onSelectGroup: (groupBy: GroupBy) => void;
}

export default function GroupByPopover({
  trigger,
  isOpen,
  onOpenChange,
  groupBy,
  onSelectGroup,
}: GroupByPopoverProps) {
  const { t } = useTranslation();

  const groupOptions: Array<{
    id: GroupBy;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: "none",
      label: t("groups.none") || "Nessun Raggruppamento",
      icon: Ban,
    },
    {
      id: "completion_status",
      label: t("groups.completion_status") || "Stato di Completamento",
      icon: CheckCircle2,
    },
    {
      id: "library",
      label: t("groups.library") || "Store / Piattaforma",
      icon: Gamepad2,
    },
    {
      id: "is_installed",
      label: t("groups.is_installed") || "Stato di Installazione",
      icon: HardDrive,
    },
    {
      id: "genre",
      label: t("groups.genre") || "Genere",
      icon: Sparkles,
    },
    {
      id: "developer",
      label: t("groups.developer") || "Sviluppatore",
      icon: Code2,
    },
    {
      id: "release_year",
      label: t("groups.release_year") || "Anno di Rilascio",
      icon: Calendar,
    },
  ];

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 overflow-hidden flex flex-col text-xs"
        style={{
          boxShadow: "0 20px 48px rgba(0,0,0,0.85)",
        }}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <h2 className="font-bold text-sm text-foreground">
              {t("groups.group_by") || "Raggruppa per"}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {groupBy !== "none" && (
              <Button
                type="button"
                variant="link"
                size="xs"
                onClick={() => {
                  onSelectGroup("none");
                  onOpenChange(false);
                }}
                className="text-sky-400 hover:text-sky-300 h-auto p-0"
              >
                {t("common.reset") || "Ripristina"}
              </Button>
            )}
            <ActionTooltip label={t("common.close") || "Chiudi"}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-6 w-6 rounded-lg"
                aria-label={t("common.close") || "Chiudi"}
              >
                <X className="w-4 h-4" />
              </Button>
            </ActionTooltip>
          </div>
        </div>

        {/* Options List */}
        <ScrollArea className="max-h-[60vh]">
          <div className="p-2 space-y-1">
            {groupOptions.map((opt) => {
              const isSelected = groupBy === opt.id;
              const Icon = opt.icon;
              return (
                <Button
                  key={opt.id}
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onSelectGroup(opt.id);
                    onOpenChange(false);
                  }}
                  className={`h-auto w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all group whitespace-normal ${
                    isSelected
                      ? "bg-sky-500/15 hover:bg-sky-500/20 border border-sky-500/30 text-white shadow-sm"
                      : "hover:bg-white/[0.04] text-slate-300 hover:text-white border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isSelected
                          ? "text-sky-400"
                          : "text-slate-400 group-hover:text-slate-200"
                      }`}
                    />
                    <span
                      className={`text-xs truncate ${
                        isSelected ? "font-semibold text-white" : "font-medium"
                      }`}
                    >
                      {opt.label}
                    </span>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ml-2 transition-all ${
                      isSelected
                        ? "border-sky-400 bg-sky-500/20"
                        : "border-white/20 bg-white/[0.04] group-hover:border-white/40"
                    }`}
                  >
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-sky-400" />
                    )}
                  </div>
                </Button>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
