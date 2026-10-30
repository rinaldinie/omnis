import React from "react";
import { Clock, CheckCircle2, Calendar, Gamepad2, Flame } from "lucide-react";
import { GlobalStatsDto } from "../../types";
import { useTranslation } from "../../i18n";

export interface QuickStatsCardsProps {
  stats: GlobalStatsDto;
  selectedYear: number;
  activeDaysCount: number;
  formatHours: (seconds: number) => string;
}

export default function QuickStatsCards({
  stats,
  selectedYear,
  activeDaysCount,
  formatHours,
}: QuickStatsCardsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Card 1: Lifetime Playtime */}
      <div
        className="p-4 rounded-2xl border transition-colors flex items-center gap-4"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div
          className="w-12 h-12 rounded-xl border flex items-center justify-center shrink-0"
          style={{
            backgroundColor: "color-mix(in srgb, #f59e0b 15%, transparent)",
            borderColor: "color-mix(in srgb, #f59e0b 30%, transparent)",
          }}
        >
          <Flame className="w-6 h-6 text-amber-400" />
        </div>
        <div className="min-w-0">
          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">
            {t("statistics.lifetime_playtime") || "Tempo Totale Libreria"}
          </span>
          <p className="text-xl font-extrabold text-[var(--text-primary)] truncate">
            {formatHours(
              stats.total_playtime_lifetime_seconds || stats.total_playtime_year_seconds
            )}
          </p>
          <span className="text-[11px] text-amber-400 font-medium">
            {t("statistics.all_time") || "Totale Storico"}
          </span>
        </div>
      </div>

      {/* Card 2: Playtime in Selected Year */}
      <div
        className="p-4 rounded-2xl border transition-colors flex items-center gap-4"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div
          className="w-12 h-12 rounded-xl border flex items-center justify-center shrink-0"
          style={{
            backgroundColor: "color-mix(in srgb, var(--accent-primary, #6366f1) 15%, transparent)",
            borderColor: "color-mix(in srgb, var(--accent-primary, #6366f1) 30%, transparent)",
          }}
        >
          <Clock className="w-6 h-6" style={{ color: "var(--accent-primary, #6366f1)" }} />
        </div>
        <div className="min-w-0">
          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">
            {t("statistics.time_in_year", { year: selectedYear })}
          </span>
          <p className="text-xl font-extrabold text-[var(--text-primary)] truncate">
            {formatHours(stats.total_playtime_year_seconds)}
          </p>
          <span
            className="text-[11px] font-medium"
            style={{ color: "var(--accent-primary, #6366f1)" }}
          >
            {t("statistics.hours_registered", {
              hours: Math.round(stats.total_playtime_year_seconds / 3600),
            })}
          </span>
        </div>
      </div>

      {/* Card 3: Days with Active Sessions */}
      <div
        className="p-4 rounded-2xl border transition-colors flex items-center gap-4"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
          <Calendar className="w-6 h-6 text-sky-400" />
        </div>
        <div className="min-w-0">
          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">
            {t("statistics.days_played")}
          </span>
          <p className="text-xl font-extrabold text-[var(--text-primary)] truncate">
            {activeDaysCount}{" "}
            <span className="text-xs text-[var(--text-muted)] font-normal">/ 365</span>
          </p>
          <span className="text-[11px] text-sky-400 font-medium">
            {t("statistics.percent_of_days", {
              percent: Math.round((activeDaysCount / 365) * 100),
            })}
          </span>
        </div>
      </div>

      {/* Card 4: Backlog Completion Rate */}
      <div
        className="p-4 rounded-2xl border transition-colors flex items-center gap-4"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">
            {t("statistics.backlog_resolved")}
          </span>
          <p className="text-xl font-extrabold text-[var(--text-primary)] truncate">
            {stats.backlog_summary.completion_percentage.toFixed(1)}%
          </p>
          <span className="text-[11px] text-emerald-400 font-medium">
            {t("statistics.games_ratio", {
              completed: stats.backlog_summary.completed_count,
              total: stats.backlog_summary.total_games,
            })}
          </span>
        </div>
      </div>

      {/* Card 5: Total Library Titles & In Progress */}
      <div
        className="p-4 rounded-2xl border transition-colors flex items-center gap-4"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
          <Gamepad2 className="w-6 h-6 text-purple-400" />
        </div>
        <div className="min-w-0">
          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">
            {t("statistics.titles_in_library")}
          </span>
          <p className="text-xl font-extrabold text-[var(--text-primary)] truncate">
            {stats.backlog_summary.total_games}
          </p>
          <span className="text-[11px] text-purple-400 font-medium">
            {t("statistics.in_progress", {
              count: stats.backlog_summary.in_progress_count,
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
