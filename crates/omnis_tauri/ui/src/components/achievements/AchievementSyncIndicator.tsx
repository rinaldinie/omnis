import React from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { AchievementSyncProgress } from "../../types";
import { useTranslation } from "../../i18n";

interface AchievementSyncIndicatorProps {
  sync: AchievementSyncProgress;
  /** "footer" renders inline in the desktop status bar, "console" as a floating pill in fullscreen mode */
  variant: "footer" | "console";
}

/** Passive, non-focusable status for background achievement syncs */
export const AchievementSyncIndicator: React.FC<AchievementSyncIndicatorProps> = ({ sync, variant }) => {
  const { t } = useTranslation();
  const isDone = sync.status === "completed";
  const isLibrary = sync.scope === "library";

  const label = isLibrary
    ? isDone
      ? t("achievements.auto_sync_done", { updated: sync.updated, total: sync.total })
      : t("achievements.auto_sync_progress", { current: sync.current, total: sync.total })
    : isDone
    ? t("achievements.auto_sync_game_done", { title: sync.title || "" })
    : t("achievements.auto_sync_game", { title: sync.title || "" });

  const percent = sync.total > 0 ? Math.round((sync.current / sync.total) * 100) : 0;
  const icon = isDone ? (
    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
  ) : (
    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-300 shrink-0" />
  );

  if (variant === "footer") {
    return (
      <span role="status" aria-live="polite" className="flex items-center gap-1.5 min-w-0 max-w-[22rem]" title={label}>
        {icon}
        <span className="truncate">{label}</span>
        {isLibrary && !isDone && (
          <span className="w-12 h-1 rounded-full bg-white/10 overflow-hidden shrink-0">
            <span className="block h-full bg-amber-300 transition-all duration-300" style={{ width: `${percent}%` }} />
          </span>
        )}
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-8 left-10 z-40 pointer-events-none select-none flex items-center gap-2.5 px-4 py-2 rounded-lg shadow-xl omnis-fade-in max-w-md"
      style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-muted)" }}
    >
      {icon}
      <span className="text-sm font-medium text-white/90 truncate">{label}</span>
      {isLibrary && !isDone && (
        <span className="w-16 h-1 rounded-full bg-white/10 overflow-hidden shrink-0">
          <span className="block h-full bg-amber-300 transition-all duration-300" style={{ width: `${percent}%` }} />
        </span>
      )}
    </div>
  );
};
