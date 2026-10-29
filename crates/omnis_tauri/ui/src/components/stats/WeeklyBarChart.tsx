import React from "react";
import { WeekPlaytimeDto } from "../../types";

interface WeeklyBarChartProps {
  weeks: WeekPlaytimeDto[];
}

export default function WeeklyBarChart({ weeks }: WeeklyBarChartProps) {
  const maxSeconds = Math.max(...weeks.map((w) => w.duration_seconds), 3600); // at least 1h for scale

  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return "0m";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-semibold uppercase tracking-wider text-[10px] text-[var(--text-muted)]">
          Ultime 4 Settimane
        </span>
        <span className="text-[10px] text-slate-500 font-mono">
          Totale: {formatDuration(weeks.reduce((acc, w) => acc + w.duration_seconds, 0))}
        </span>
      </div>

      <div className="h-32 w-full flex items-end justify-between gap-3 pt-4 pb-1 px-2 rounded-xl bg-white/[0.02] border border-white/[0.05]">
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
              {/* Duration popup label on hover or if duration > 0 */}
              <span className="text-[10px] font-semibold text-slate-300 group-hover:text-emerald-400 transition-colors whitespace-nowrap">
                {formatDuration(week.duration_seconds)}
              </span>

              {/* Bar */}
              <div className="w-full max-w-[48px] bg-white/[0.05] rounded-t-md overflow-hidden flex items-end h-full">
                <div
                  className="w-full rounded-t-md transition-all duration-500 group-hover:brightness-125"
                  style={{
                    height: `${heightPercent}%`,
                    backgroundColor:
                      week.duration_seconds > 0
                        ? "var(--accent-primary, #6366f1)"
                        : "rgba(255, 255, 255, 0.04)",
                  }}
                />
              </div>

              {/* Week label */}
              <div className="text-center">
                <span className="text-[10px] font-medium text-slate-400 group-hover:text-white transition-colors block">
                  {week.week_label}
                </span>
                <span className="text-[8px] text-slate-500 block -mt-0.5">
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
