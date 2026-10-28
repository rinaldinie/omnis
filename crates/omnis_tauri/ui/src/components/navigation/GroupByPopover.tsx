import React, { useRef, useEffect } from "react";
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

export interface GroupByPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  groupBy: GroupBy;
  onSelectGroup: (groupBy: GroupBy) => void;
}

export default function GroupByPopover({
  isOpen,
  onClose,
  groupBy,
  onSelectGroup,
}: GroupByPopoverProps) {
  const { t } = useTranslation();
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-2 w-72 rounded-2xl border shadow-2xl backdrop-blur-2xl z-50 overflow-hidden flex flex-col text-xs animate-in fade-in zoom-in-95 duration-150"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-color)",
        boxShadow: "0 20px 48px rgba(0,0,0,0.85)",
      }}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-sky-400" />
          <h2 className="font-bold text-sm text-white">
            {t("groups.group_by") || "Raggruppa per"}
          </h2>
        </div>

        <div className="flex items-center gap-2.5">
          {groupBy !== "none" && (
            <button
              type="button"
              onClick={() => {
                onSelectGroup("none");
                onClose();
              }}
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
            >
              {t("common.reset") || "Ripristina"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title={t("common.close") || "Chiudi"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Options List */}
      <div className="p-2 space-y-1 overflow-y-auto max-h-[60vh] custom-scrollbar">
        {groupOptions.map((opt) => {
          const isSelected = groupBy === opt.id;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onSelectGroup(opt.id);
                onClose();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all group cursor-pointer ${
                isSelected
                  ? "bg-sky-500/15 border border-sky-500/30 text-white shadow-sm"
                  : "hover:bg-white/[0.04] text-slate-300 hover:text-white border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isSelected ? "text-sky-400" : "text-slate-400 group-hover:text-slate-200"
                  }`}
                />
                <span className={`text-xs truncate ${isSelected ? "font-semibold text-white" : "font-medium"}`}>
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
                {isSelected && <div className="w-2 h-2 rounded-full bg-sky-400" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
