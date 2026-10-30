import React, { useState } from "react";
import { DayActivityDto, DaySessionDto, formatImageUrl } from "../../types";
import { useTranslation } from "../../i18n";
import { Clock, Calendar, X, ExternalLink } from "lucide-react";
import soundEffects from "../../utils/soundEffects";

interface ActivityHeatmapCalendarProps {
  activityData: DayActivityDto[];
  year: number;
  onSelectGame?: (gameId: string) => void;
}

export default function ActivityHeatmapCalendar({
  activityData,
  year,
  onSelectGame,
}: ActivityHeatmapCalendarProps) {
  const { t, locale } = useTranslation();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hoveredDay, setHoveredDay] = useState<{
    date: string;
    duration: number;
    count: number;
    sessions: DaySessionDto[];
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

  const formatTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString(localeStr, {
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } catch (_) {}
    return isoStr.slice(11, 16) || isoStr;
  };

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

  const selectedAct = selectedDate ? activityMap.get(selectedDate) : null;

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
                    const isSelected = selectedDate === day.dateStr;

                    return (
                      <div
                        key={dIdx}
                        onClick={() => {
                          if (day.inYear && count > 0) {
                            soundEffects.playSelect();
                            setSelectedDate(isSelected ? null : day.dateStr);
                          }
                        }}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredDay({
                            date: day.dateStr,
                            duration,
                            count,
                            sessions: act?.sessions || [],
                            x: rect.left + rect.width / 2,
                            y: rect.top - 8,
                          });
                        }}
                        onMouseLeave={() => setHoveredDay(null)}
                        className={`w-3 h-3 rounded-[3px] transition-all duration-150 ${
                          day.inYear
                            ? count > 0
                              ? `cursor-pointer hover:ring-2 hover:ring-[var(--accent-primary)] hover:scale-125 hover:z-10 ${
                                  isSelected
                                    ? "ring-2 ring-[var(--accent-primary)] scale-125 z-10 shadow-lg"
                                    : ""
                                }`
                              : "cursor-default opacity-40 hover:opacity-80"
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
          className={`fixed z-50 pointer-events-none px-3 py-2 rounded-xl border shadow-2xl backdrop-blur-md text-left text-xs whitespace-nowrap animate-in fade-in zoom-in-95 duration-100 max-w-xs ${
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
          <div className="font-semibold text-[var(--text-primary)] capitalize text-center">
            {new Date(hoveredDay.date).toLocaleDateString(localeStr, {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
          <div
            className="text-[11px] font-medium text-center mb-0.5"
            style={{ color: "var(--accent-primary, #6366f1)" }}
          >
            {hoveredDay.duration > 0
              ? `${formatDuration(hoveredDay.duration)} (${hoveredDay.count} ${
                  t(hoveredDay.count === 1 ? "statistics.session" : "statistics.sessions")
                })`
              : t("statistics.no_sessions")}
          </div>

          {/* Individual Sessions Mini-Preview in Tooltip */}
          {hoveredDay.sessions && hoveredDay.sessions.length > 0 && (
            <div
              className="border-t pt-1.5 mt-1 space-y-1 text-[11px]"
              style={{ borderColor: "var(--border-color)" }}
            >
              {hoveredDay.sessions.slice(0, 3).map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 text-[var(--text-secondary)]"
                >
                  <span className="truncate max-w-[150px] font-medium text-[var(--text-primary)]">
                    {s.game_title}
                  </span>
                  <span className="font-mono text-[10px] shrink-0 opacity-80">
                    {formatDuration(s.duration_seconds)}
                  </span>
                </div>
              ))}
              {hoveredDay.sessions.length > 3 && (
                <div className="text-[10px] text-[var(--text-muted)] italic text-center">
                  {t("statistics.and_more_sessions", {
                    count: hoveredDay.sessions.length - 3,
                  })}
                </div>
              )}
              <div className="text-[10px] text-[var(--accent-primary)] font-medium text-center pt-0.5 opacity-90">
                {t("statistics.click_to_view_details")}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selected Day Sessions Inspector Panel */}
      {selectedDate && selectedAct && selectedAct.count_sessions > 0 && (
        <div
          className="p-4 rounded-xl border animate-in fade-in slide-in-from-top-2 duration-200 mt-2"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-color)",
          }}
        >
          <div
            className="flex items-center justify-between gap-3 pb-3 border-b"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--accent-primary, #6366f1) 15%, transparent)",
                  color: "var(--accent-primary, #6366f1)",
                }}
              >
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  {t("statistics.day_details_title", {
                    date: new Date(selectedDate).toLocaleDateString(localeStr, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }),
                  })}
                </h3>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {t("statistics.day_sessions_count", {
                    count: selectedAct.count_sessions,
                  })}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full border"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--accent-primary, #6366f1) 15%, transparent)",
                  borderColor:
                    "color-mix(in srgb, var(--accent-primary, #6366f1) 30%, transparent)",
                  color: "var(--accent-primary, #6366f1)",
                }}
              >
                {formatDuration(selectedAct.duration_seconds)}
              </span>
              <button
                onClick={() => {
                  soundEffects.playSelect();
                  setSelectedDate(null);
                }}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors cursor-pointer"
                title={t("statistics.close_details")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List of Sessions */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {selectedAct.sessions?.map((session, sIdx) => {
              const coverUrl = formatImageUrl(session.cover_image);
              const startTime = formatTime(session.started_at);
              const endTime = formatTime(session.ended_at);

              return (
                <div
                  key={session.id || sIdx}
                  className="flex items-center gap-3 p-3 rounded-xl border transition-all duration-200"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  {/* Cover image or initials fallback */}
                  <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-900 border border-white/5 relative">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={session.game_title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-xs text-[var(--accent-primary)] bg-[var(--accent-glow)]">
                        {session.game_title.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Session Information */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4
                        className="text-xs font-bold text-[var(--text-primary)] truncate transition-colors"
                        title={session.game_title}
                      >
                        {session.game_title}
                      </h4>
                      {session.library_id && (
                        <span
                          className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border text-[var(--text-muted)] shrink-0"
                          style={{ borderColor: "var(--border-color)" }}
                        >
                          {session.library_id}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] mt-1">
                      <Clock className="w-3 h-3 shrink-0 opacity-70" />
                      <span>
                        {t("statistics.session_time_range", {
                          start: startTime,
                          end: endTime,
                        })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                        style={{
                          backgroundColor:
                            "color-mix(in srgb, var(--accent-primary, #6366f1) 12%, transparent)",
                          color: "var(--accent-primary, #6366f1)",
                        }}
                      >
                        {formatDuration(session.duration_seconds)}
                      </span>

                      {onSelectGame && session.game_id && (
                        <button
                          onClick={() => {
                            soundEffects.playSelect();
                            onSelectGame(session.game_id);
                          }}
                          className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--accent-primary)] flex items-center gap-1 cursor-pointer transition-colors"
                          title={t("statistics.view_game_in_library")}
                        >
                          <span>{t("statistics.view_game_in_library")}</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
