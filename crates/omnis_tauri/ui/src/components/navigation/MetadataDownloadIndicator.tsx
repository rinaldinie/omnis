import React from "react";
import { AlertCircle, CheckCircle2, RefreshCw, X } from "lucide-react";
import type { MetadataDownloadState } from "../../stores";
import { useTranslation } from "../../i18n";
import { Progress } from "@/components/ui/progress";

export interface MetadataDownloadIndicatorProps {
  download: MetadataDownloadState;
  onCancel?: () => void;
}

/** Compact non-blocking status indicator in the footer status bar for background metadata downloads. */
export const MetadataDownloadIndicator: React.FC<MetadataDownloadIndicatorProps> = ({
  download,
  onCancel,
}) => {
  const { t } = useTranslation();

  const isRunning = download.status === "running";
  const isCompleted = download.status === "completed";
  const isCancelled = download.status === "cancelled";
  const hasCounts = download.total > 0;
  const percent = hasCounts
    ? Math.min(100, Math.round((download.current / download.total) * 100))
    : 0;

  let label: string;
  if (isRunning) {
    label = hasCounts
      ? t("app_status.metadata_bar_progress", {
          current: download.current,
          total: download.total,
          title: download.title,
        })
      : t("app_status.metadata_bar_running", { title: download.title });
  } else if (isCompleted) {
    label =
      download.mode === "single" && download.title
        ? t("app_status.metadata_updated_game", { title: download.title })
        : t("app_status.metadata_updated");
  } else if (isCancelled) {
    label = t("app_status.metadata_bar_cancelled");
  } else {
    label = t("app_status.metadata_error", { error: download.error || "" });
  }

  const icon = isRunning ? (
    <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
  ) : isCompleted ? (
    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
  ) : isCancelled ? (
    <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
  ) : (
    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
  );

  return (
    <span
      role="status"
      aria-live="polite"
      className="flex items-center gap-1.5 min-w-0 max-w-[24rem]"
      title={label}
    >
      {icon}
      <span
        className={`truncate ${
          isRunning
            ? "text-sky-300 font-semibold"
            : isCompleted
            ? "text-emerald-300"
            : isCancelled
            ? "text-amber-300"
            : "text-rose-300"
        }`}
      >
        {label}
      </span>
      {isRunning && hasCounts && (
        <Progress
          value={percent}
          className="w-14 h-1 shrink-0"
          indicatorClassName="bg-sky-400"
        />
      )}
      {isRunning && download.mode !== "single" && onCancel && (
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("batch_enrich.stop")}
          title={t("batch_enrich.stop")}
          className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-rose-400 transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
};
