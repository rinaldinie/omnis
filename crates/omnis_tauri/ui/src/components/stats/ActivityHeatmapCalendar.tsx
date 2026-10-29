import React, { useState } from "react";
import { DayActivityDto } from "../../types";
import { useTranslation } from "../../i18n";

interface ActivityHeatmapCalendarProps {
  activityData: DayActivityDto[];
  year: number;
}

export default function ActivityHeatmapCalendar({
  activityData,
  year,
}: ActivityHeatmapCalendarProps) {
  const { t, locale } = useTranslation();
  const [hoveredDay, setHoveredDay] = useState<{
    date: string;
    duration: number;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  // Map activities by date "YYYY-MM-DD"
  const activityMap = new Map<string, DayActivityDto>();
  for (const item of activityData) {
    activityMap.set(item.date, item);
  }

  // Generate 52 weeks (364/365 days) for the calendar
  // We align weeks starting on Monday (ISO week)
  const startDate = new Date(Date.UTC(year, 0, 1));
  const dayOfWeek = startDate.getUTCDay(); // 0 is Sunday, 1 is Monday
  const startOffset = (dayOfWeek + 6) % 7;
  const calendarStart = new Date(startDate);
  calendarStart.setUTCDate(startDate.getUTCDate() - startOffset);

  const weeks: Array<Array<{ date: Date; dateStr: string; inYear: boolean }>> = [];
  const curr = new Date(calendarStart);

  for (let w = 0; w < 53; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const yearMatches = curr.getUTCFullYear() === year;
      const dateStr = curr.toISOString().split("T")[0];
      week.push({
        date: new Date(curr),
        dateStr,
        inYear: yearMatches,
      });
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    weeks.push(week);
    if (curr.getUTCFullYear() > year && w >= 51) break;
  }

  const getLevel = (seconds: number) => {
    if (seconds <= 0) return 0;
    if (seconds < 1800) return 1; // < 30m
    if (seconds < 7200) return 2; // 30m - 2h
    if (seconds < 14400) return 3; // 2h - 4h
    return 4; // > 4h
  };

  const getCellColor = (level: number, inYear: boolean) => {
    if (!inYear) return "rgba(255, 255, 255, 0.02)";
    switch (level) {
      case 0:
        return "rgba(255, 255, 255, 0.05)";
      case 1:
        return "rgba(16, 185, 129, 0.35)";
      case 2:
        return "rgba(16, 185, 129, 0.60)";
      case 3:
        return "rgba(16, 185, 129, 0.85)";
      case 4:
        return "#10b981";
      default:
        return "rgba(255, 255, 255, 0.05)";
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  // Month labels positioning with locale formatting
  const monthLabels: Array<{ label: string; weekIndex: number }> = [];
  const localeMap: Record<string, string> = {
    it: "it-IT",
    de: "de-DE",
    es: "es-ES",
    fr: "fr-FR",
    ja: "ja-JP",
    en: "en-US",
  };
  const localeStr = localeMap[locale] || "en-US";

  let lastMonth = -1;
  weeks.forEach((week, wIdx) => {
    const firstDay = week.find((d) => d.inYear);
    if (firstDay) {
      const m = firstDay.date.getUTCMonth();
      if (m !== lastMonth) {
        const monthLabel = firstDay.date.toLocaleDateString(localeStr, { month: "short" });
        monthLabels.push({ label: monthLabel, weekIndex: wIdx });
        lastMonth = m;
      }
    }
  });

  const activeDays = activityData.filter((d) => d.duration_seconds > 0).length;
  const maxDay = activityData.reduce(
    (max, curr) => (curr.duration_seconds > max.duration_seconds ? curr : max),
    { date: "N/A", duration_seconds: 0, count_sessions: 0 }
  );

  return (
    <div className="flex flex-col gap-3 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] relative">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            {t("statistics.heatmap_title", { year })}
          </span>
          <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            {t("statistics.active_days", { count: activeDays })}
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span>{t("statistics.less")}</span>
          <span className="w-3 h-3 rounded-[3px] bg-white/[0.05] border border-white/5" />
          <span className="w-3 h-3 rounded-[3px] bg-emerald-500/35" />
          <span className="w-3 h-3 rounded-[3px] bg-emerald-500/60" />
          <span className="w-3 h-3 rounded-[3px] bg-emerald-500/85" />
          <span className="w-3 h-3 rounded-[3px] bg-emerald-500" />
          <span>{t("statistics.more")}</span>
        </div>
      </div>

      {/* Heatmap Grid Container */}
      <div className="overflow-x-auto pb-2 custom-scrollbar">
        <div className="min-w-[760px] flex flex-col gap-1.5">
          {/* Months Header */}
          <div className="flex text-[10px] text-slate-400 font-medium pl-7 h-4 relative">
            {monthLabels.map((m, idx) => (
              <span
                key={idx}
                className="absolute capitalize"
                style={{ left: `${m.weekIndex * 14.5 + 28}px` }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            {/* Weekday indicators */}
            <div className="flex flex-col justify-between text-[9px] text-slate-500 font-medium py-0.5 w-5 text-right shrink-0 select-none">
              <span>{t("statistics.weekday_mon")}</span>
              <span>{t("statistics.weekday_wed")}</span>
              <span>{t("statistics.weekday_fri")}</span>
              <span>{t("statistics.weekday_sun")}</span>
            </div>

            {/* Weeks Columns */}
            <div className="flex gap-1">
              {weeks.map((week, wIdx) => (
                <div key={wIdx} className="flex flex-col gap-1">
                  {week.map((day, dIdx) => {
                    const act = activityMap.get(day.dateStr);
                    const duration = act ? act.duration_seconds : 0;
                    const count = act ? act.count_sessions : 0;
                    const level = getLevel(duration);

                    return (
                      <div
                        key={dIdx}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredDay({
                            date: day.dateStr,
                            duration,
                            count,
                            x: rect.left + rect.width / 2,
                            y: rect.top - 8,
                          });
                        }}
                        onMouseLeave={() => setHoveredDay(null)}
                        className={`w-3 h-3 rounded-[3px] transition-all duration-150 cursor-pointer ${
                          day.inYear ? "hover:ring-1 hover:ring-white/80 hover:scale-125 hover:z-10" : "opacity-30"
                        }`}
                        style={{
                          backgroundColor: getCellColor(level, day.inYear),
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Tooltip with Auto-Flip */}
      {hoveredDay && (
        <div
          className={`fixed z-50 pointer-events-none px-2.5 py-1.5 rounded-lg bg-slate-900/95 border border-white/20 shadow-xl backdrop-blur-md text-center text-xs whitespace-nowrap animate-in fade-in zoom-in-95 duration-100 ${
            hoveredDay.y < 60
              ? "transform -translate-x-1/2 translate-y-3"
              : "transform -translate-x-1/2 -translate-y-full"
          }`}
          style={{ left: hoveredDay.x, top: hoveredDay.y }}
        >
          <div className="font-semibold text-white capitalize">
            {new Date(hoveredDay.date).toLocaleDateString(localeStr, {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
          <div className="text-[11px] text-emerald-400 font-medium">
            {hoveredDay.duration > 0
              ? `${formatDuration(hoveredDay.duration)} (${hoveredDay.count} ${
                  t(hoveredDay.count === 1 ? "statistics.session" : "statistics.sessions")
                })`
              : t("statistics.no_sessions")}
          </div>
        </div>
      )}

      {/* Footer Info */}
      {maxDay.duration_seconds > 0 && (
        <div className="text-[11px] text-slate-400 flex items-center justify-between border-t border-white/[0.04] pt-2 mt-1">
          <span>
            {t("statistics.highest_day")}:{" "}
            <strong className="text-white capitalize">
              {new Date(maxDay.date).toLocaleDateString(localeStr, {
                day: "numeric",
                month: "long",
              })}
            </strong>{" "}
            ({formatDuration(maxDay.duration_seconds)})
          </span>
          <span className="text-slate-500 font-mono">
            {year}
          </span>
        </div>
      )}
    </div>
  );
}
