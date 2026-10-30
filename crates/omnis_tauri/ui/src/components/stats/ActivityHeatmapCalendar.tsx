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
    if (!inYear) return "transparent";
    switch (level) {
      case 0:
        return "color-mix(in srgb, var(--border-color) 45%, transparent)";
      case 1:
        return "color-mix(in srgb, var(--accent-primary, #6366f1) 30%, transparent)";
      case 2:
        return "color-mix(in srgb, var(--accent-primary, #6366f1) 55%, transparent)";
      case 3:
        return "color-mix(in srgb, var(--accent-primary, #6366f1) 80%, transparent)";
      case 4:
        return "var(--accent-primary, #6366f1)";
      default:
        return "color-mix(in srgb, var(--border-color) 45%, transparent)";
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
    <div
      className="flex flex-col gap-3 p-5 rounded-2xl border relative transition-colors duration-300"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
            {t("statistics.heatmap_title", { year })}
          </span>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full border transition-colors"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent-primary, #6366f1) 15%, transparent)",
              borderColor: "color-mix(in srgb, var(--accent-primary, #6366f1) 30%, transparent)",
              color: "var(--accent-primary, #6366f1)",
            }}
          >
            {t("statistics.active_days", { count: activeDays })}
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <span>{t("statistics.less")}</span>
          <span
            className="w-3 h-3 rounded-[3px] border"
            style={{
              backgroundColor: "color-mix(in srgb, var(--border-color) 45%, transparent)",
              borderColor: "var(--border-color)",
            }}
          />
          <span
            className="w-3 h-3 rounded-[3px]"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent-primary, #6366f1) 30%, transparent)",
            }}
          />
          <span
            className="w-3 h-3 rounded-[3px]"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent-primary, #6366f1) 55%, transparent)",
            }}
          />
          <span
            className="w-3 h-3 rounded-[3px]"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent-primary, #6366f1) 80%, transparent)",
            }}
          />
          <span
            className="w-3 h-3 rounded-[3px]"
            style={{ backgroundColor: "var(--accent-primary, #6366f1)" }}
          />
          <span>{t("statistics.more")}</span>
        </div>
      </div>

      {/* Heatmap Grid Container */}
      <div className="overflow-x-auto pb-2 custom-scrollbar">
        <div className="min-w-[760px] flex flex-col gap-1.5">
          {/* Months Header */}
          <div className="flex text-[10px] text-[var(--text-muted)] font-medium pl-7 h-4 relative">
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
            <div className="flex flex-col justify-between text-[9px] text-[var(--text-muted)] opacity-75 font-medium py-0.5 w-5 text-right shrink-0 select-none">
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
                          day.inYear
                            ? "hover:ring-1 hover:ring-[var(--accent-primary)] hover:scale-125 hover:z-10"
                            : "opacity-20 pointer-events-none"
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
          className={`fixed z-50 pointer-events-none px-2.5 py-1.5 rounded-xl border shadow-2xl backdrop-blur-md text-center text-xs whitespace-nowrap animate-in fade-in zoom-in-95 duration-100 ${
            hoveredDay.y < 60
              ? "transform -translate-x-1/2 translate-y-3"
              : "transform -translate-x-1/2 -translate-y-full"
          }`}
          style={{
            left: hoveredDay.x,
            top: hoveredDay.y,
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          <div className="font-semibold text-[var(--text-primary)] capitalize">
            {new Date(hoveredDay.date).toLocaleDateString(localeStr, {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
          <div
            className="text-[11px] font-medium"
            style={{ color: "var(--accent-primary, #6366f1)" }}
          >
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
        <div
          className="text-[11px] text-[var(--text-muted)] flex items-center justify-between border-t pt-2 mt-1"
          style={{ borderColor: "var(--border-color)" }}
        >
          <span>
            {t("statistics.highest_day")}:{" "}
            <strong className="text-[var(--text-primary)] capitalize">
              {new Date(maxDay.date).toLocaleDateString(localeStr, {
                day: "numeric",
                month: "long",
              })}
            </strong>{" "}
            ({formatDuration(maxDay.duration_seconds)})
          </span>
          <span className="text-[var(--text-muted)] font-mono">
            {year}
          </span>
        </div>
      )}
    </div>
  );
}
