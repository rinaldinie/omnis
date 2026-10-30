import React from "react";
import { Sparkles } from "lucide-react";
import { BacklogSummaryDto } from "../../types";
import { useTranslation } from "../../i18n";

export interface BacklogProgressCardProps {
  backlogSummary: BacklogSummaryDto;
}

export default function BacklogProgressCard({
  backlogSummary,
}: BacklogProgressCardProps) {
  const { t } = useTranslation();

  return (
    <div
      className="p-6 rounded-2xl border space-y-4 transition-colors duration-300"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
            {t("statistics.backlog_progress_title")}
          </h3>
        </div>
        <span className="text-xs font-semibold text-[var(--text-muted)]">
          {backlogSummary.completed_count} {t("statistics.completed_beaten")} •{" "}
          {backlogSummary.in_progress_count} {t("statistics.started_in_progress")} •{" "}
          {backlogSummary.not_played_count} {t("statistics.not_played")}
        </span>
      </div>

      {/* Backlog Multi-Segment Progress Bar */}
      {backlogSummary.total_games > 0 && (
        <div className="space-y-2">
          <div
            className="h-3.5 w-full rounded-full overflow-hidden flex p-0.5 border"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
            }}
          >
            {/* Completed / Beaten */}
            <div
              title={`${t("statistics.completed_beaten")}: ${backlogSummary.completed_count} (${backlogSummary.completion_percentage.toFixed(1)}%)`}
              className="h-full bg-emerald-500 rounded-l-full transition-all duration-500"
              style={{
                width: `${(backlogSummary.completed_count / backlogSummary.total_games) * 100}%`,
              }}
            />
            {/* In Progress */}
            <div
              title={`${t("statistics.started_in_progress")}: ${backlogSummary.in_progress_count}`}
              className="h-full bg-amber-500 transition-all duration-500"
              style={{
                width: `${(backlogSummary.in_progress_count / backlogSummary.total_games) * 100}%`,
              }}
            />
            {/* Not Played */}
            <div
              title={`${t("statistics.not_played")}: ${backlogSummary.not_played_count}`}
              className="h-full rounded-r-full transition-all duration-500"
              style={{
                backgroundColor: "color-mix(in srgb, var(--border-color) 70%, transparent)",
                width: `${(backlogSummary.not_played_count / backlogSummary.total_games) * 100}%`,
              }}
            />
          </div>

          {/* Legend badges */}
          <div className="flex items-center justify-between text-xs pt-1 flex-wrap gap-2 text-[var(--text-muted)]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>
                {t("statistics.completed_beaten")}: <strong>{backlogSummary.completed_count}</strong> (
                {backlogSummary.completion_percentage.toFixed(1)}%)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>
                {t("statistics.started_in_progress")}: <strong>{backlogSummary.in_progress_count}</strong> (
                {(
                  (backlogSummary.in_progress_count / backlogSummary.total_games) *
                  100
                ).toFixed(1)}
                %)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: "var(--border-color)" }}
              />
              <span>
                {t("statistics.not_played")}: <strong>{backlogSummary.not_played_count}</strong> (
                {(
                  (backlogSummary.not_played_count / backlogSummary.total_games) *
                  100
                ).toFixed(1)}
                %)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
