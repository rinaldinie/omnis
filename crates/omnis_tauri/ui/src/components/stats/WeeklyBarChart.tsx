import React from "react";
import { WeekPlaytimeDto } from "../../types";
import { useTranslation } from "../../i18n";

interface WeeklyBarChartProps {
  weeks: WeekPlaytimeDto[];
}

export default function WeeklyBarChart({ weeks }: WeeklyBarChartProps) {
  const { t } = useTranslation();
  const maxSeconds = Math.max(...weeks.map((w) => w.duration_seconds), 3600);

  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return `0${t("statistics.min")}`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${mins}${t("statistics.min")}`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span className="font-semibold uppercase tracking-wider text-[10px] text-[var(--text-muted)]">
          {t("statistics.last_4_weeks")}
        </span>
        <span className="text-[10px] text-[var(--text-muted)] opacity-80 font-mono">
          {t("statistics.total")}: {formatDuration(weeks.reduce((acc, w) => acc + w.duration_seconds, 0))}
        </span>
      </div>

      <div
        className="h-32 w-full flex items-end justify-between gap-3 pt-4 pb-1 px-2 rounded-xl border transition-colors duration-300"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        {weeks.map((week, idx) => {
          const heightPercent = Math.max(
            Math.round((week.duration_seconds / maxSeconds) * 100),
            week.duration_seconds > 0 ? 8 : 2
          );

          return (
            <div
              key={idx}
              className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group relative"
            >
              {/* Duration label */}
              <span className="text-[10px] font-semibold text-[var(--text-muted)] group-hover:text-[var(--accent-primary)] transition-colors whitespace-nowrap">
                {formatDuration(week.duration_seconds)}
              </span>

              {/* Bar */}
              <div
                className="w-full max-w-[48px] rounded-t-md overflow-hidden flex items-end h-full"
                style={{ backgroundColor: "var(--bg-surface)" }}
              >
                <div
                  className="w-full rounded-t-md transition-all duration-500 group-hover:brightness-125"
                  style={{
                    height: `${heightPercent}%`,
                    backgroundColor:
                      week.duration_seconds > 0
                        ? "var(--accent-primary, #6366f1)"
                        : "color-mix(in srgb, var(--border-color) 40%, transparent)",
                  }}
                />
              </div>

              {/* Week label */}
              <div className="text-center">
                <span className="text-[10px] font-medium text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors block">
                  {t("statistics.week_num", { num: idx + 1 })}
                </span>
                <span className="text-[8px] text-[var(--text-muted)] opacity-70 block -mt-0.5">
                  {week.start_date.slice(5)} - {week.end_date.slice(5)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
