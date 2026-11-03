import React from "react";
import { BarChart3, CalendarDays, Clock, Flame, Hourglass } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../../api";
import { CategoryShareDto, DayActivityDto, GameDto, GlobalStatsDto } from "../../types";
import soundEffects from "../../utils/soundEffects";
import { ArtImage } from "./FullscreenCards";
import { Glyph } from "./ConsoleChrome";
import { STORE_LABELS } from "./constants";

const TOP_GAMES = 8;
const TOP_SHARES = 6;
const SECTIONS = ["overview", "monthly", "activity", "top", "breakdown", "backlog"] as const;
type Section = (typeof SECTIONS)[number];

function formatHours(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${mins}m`;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

/** Days of `year` in Monday-first week columns; null pads the days outside the year. */
function yearWeeks(year: number): Array<Array<string | null>> {
  const weeks: Array<Array<string | null>> = [];
  const day = new Date(Date.UTC(year, 0, 1));
  let week: Array<string | null> = Array((day.getUTCDay() + 6) % 7).fill(null);
  while (day.getUTCFullYear() === year) {
    week.push(day.toISOString().slice(0, 10));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  if (week.length > 0) weeks.push([...week, ...Array(7 - week.length).fill(null)]);
  return weeks;
}

export interface FullscreenStatsPageProps {
  isOpen: boolean;
  games: GameDto[];
  onClose: () => void;
  locale: string;
  t: (key: string, params?: Record<string, any>) => string;
}

export const FullscreenStatsPage: React.FC<FullscreenStatsPageProps> = ({ isOpen, games, onClose, locale, t }) => {
  const currentYear = new Date().getUTCFullYear();
  const [year, setYear] = React.useState(currentYear);
  const [stats, setStats] = React.useState<GlobalStatsDto | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [focused, setFocused] = React.useState<Section>("overview");
  const sectionRefs = React.useRef<Partial<Record<Section, HTMLElement | null>>>({});

  React.useEffect(() => {
    if (!isOpen) return;
    setFocused("overview");
    sectionRefs.current.overview?.scrollIntoView({ block: "nearest" });
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    api.stats
      .getGlobalStatistics({ year })
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch((err) => console.error("Failed to load global statistics:", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, year]);

  // Oldest first, so LB goes back in time and RB forward
  const years = React.useMemo(() => {
    const list = stats?.available_years?.length ? [...stats.available_years] : [currentYear];
    if (!list.includes(year)) list.push(year);
    return list.sort((a, b) => a - b);
  }, [stats?.available_years, year, currentYear]);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleNav = (e: Event) => {
      const dir = (e as CustomEvent<{ direction: "up" | "down" | "left" | "right" }>).detail?.direction;
      if (dir !== "up" && dir !== "down") return;
      setFocused((prev) => {
        const idx = SECTIONS.indexOf(prev);
        const next = SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, idx + (dir === "down" ? 1 : -1)))];
        if (next !== prev) {
          soundEffects.playNav();
          sectionRefs.current[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        return next;
      });
    };
    const handleBumper = (e: Event) => {
      const direction = (e as CustomEvent<{ direction: number }>).detail?.direction ?? 1;
      const next = years[years.indexOf(year) + direction];
      if (next === undefined) return;
      soundEffects.playNav();
      setYear(next);
    };

    window.addEventListener("omnis:page-nav", handleNav);
    window.addEventListener("omnis:page-bumper", handleBumper);
    return () => {
      window.removeEventListener("omnis:page-nav", handleNav);
      window.removeEventListener("omnis:page-bumper", handleBumper);
    };
  }, [isOpen, years, year]);

  const heatmap = React.useMemo(() => {
    const byDate = new Map<string, DayActivityDto>();
    stats?.activity_heatmap.forEach((d) => byDate.set(d.date, d));
    return byDate;
  }, [stats]);

  const activeDays = React.useMemo(
    () => (stats?.activity_heatmap ?? []).filter((d) => d.duration_seconds > 0),
    [stats]
  );
  const sessionCount = activeDays.reduce((sum, d) => sum + d.count_sessions, 0);
  const peakDay = activeDays.reduce<DayActivityDto | null>(
    (best, d) => (!best || d.duration_seconds > best.duration_seconds ? d : best),
    null
  );

  const months = React.useMemo(() => {
    const totals = Array(12).fill(0) as number[];
    activeDays.forEach((d) => {
      const month = Number(d.date.slice(5, 7)) - 1;
      if (month >= 0 && month < 12) totals[month] += d.duration_seconds;
    });
    return totals;
  }, [activeDays]);
  const maxMonth = Math.max(...months, 1);

  const topGames = React.useMemo(
    () =>
      games
        .filter((g) => g.playtime_seconds > 0)
        .sort((a, b) => b.playtime_seconds - a.playtime_seconds)
        .slice(0, TOP_GAMES),
    [games]
  );

  if (!isOpen) return null;

  const formatDay = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: "UTC" });
  const monthName = (month: number) =>
    new Date(Date.UTC(year, month, 1)).toLocaleDateString(locale, { month: "short", timeZone: "UTC" });

  const sectionProps = (id: Section) => ({
    ref: (el: HTMLElement | null) => {
      sectionRefs.current[id] = el;
    },
    onClick: () => setFocused(id),
    className: "p-8 rounded-lg scroll-my-10 transition-shadow duration-200",
    style: {
      backgroundColor: "rgba(255, 255, 255, 0.04)",
      boxShadow: focused === id ? "0 0 0 0.15rem rgba(255, 255, 255, 0.6)" : "none",
    },
  });

  const heading = (text: string, aside?: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-6 mb-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-white/60">{text}</h2>
      {aside && <span className="text-base text-white/55">{aside}</span>}
    </div>
  );

  const tiles: Array<{ icon: LucideIcon; label: string; value: string }> = stats
    ? [
        {
          icon: Clock,
          label: t("statistics.time_in_year", { year }),
          value: formatHours(stats.total_playtime_year_seconds),
        },
        {
          icon: Hourglass,
          label: t("statistics.lifetime_playtime"),
          value: formatHours(stats.total_playtime_lifetime_seconds ?? 0),
        },
        { icon: CalendarDays, label: t("statistics.days_played"), value: String(activeDays.length) },
        { icon: Flame, label: t("console_ui.stats_sessions"), value: String(sessionCount) },
      ]
    : [];

  const backlog = stats?.backlog_summary;
  const backlogSegments = backlog
    ? [
        { label: t("statistics.completed_beaten"), count: backlog.completed_count, color: "#34d399" },
        { label: t("statistics.started_in_progress"), count: backlog.in_progress_count, color: "var(--accent-primary)" },
        { label: t("statistics.not_played"), count: backlog.not_played_count, color: "rgba(255, 255, 255, 0.25)" },
      ]
    : [];

  const renderShares = (title: string, items: CategoryShareDto[], isStore: boolean) => (
    <div>
      <h3 className="text-base font-semibold text-white/80 mb-4">{title}</h3>
      {items.length === 0 ? (
        <p className="text-base text-white/50">{t("statistics.no_data")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {items.slice(0, TOP_SHARES).map((item) => (
            <div key={item.name}>
              <div className="flex items-baseline justify-between gap-4 text-base">
                <span className="text-white truncate">{isStore ? STORE_LABELS[item.name] ?? item.name : item.name}</span>
                <span className="text-white/60 tabular-nums shrink-0">
                  {formatHours(item.duration_seconds)} · {Math.round(item.percentage)}%
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(item.percentage, 1)}%`, backgroundColor: "var(--accent-primary)" }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[45] flex flex-col omnis-fade-in" style={{ backgroundColor: "var(--bg-base)" }}>
      {/* Header */}
      <header className="flex items-end justify-between gap-8 px-16 pt-14 pb-8">
        <h1 className="flex items-center gap-4 text-5xl font-bold text-white tracking-tight">
          <BarChart3 className="w-10 h-10" style={{ color: "var(--accent-primary)" }} />
          {t("console_ui.statistics")}
        </h1>
        <div className="flex items-center gap-4 text-3xl font-semibold text-white tabular-nums">
          <span className={years.indexOf(year) > 0 ? "" : "opacity-30"}>
            <Glyph kind="lb" />
          </span>
          <span className={loading ? "opacity-60" : ""}>{year}</span>
          <span className={years.indexOf(year) < years.length - 1 ? "" : "opacity-30"}>
            <Glyph kind="rb" />
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar px-16 pb-24 scroll-pt-6 scroll-pb-24">
        {!stats ? (
          <p className="py-16 text-center text-lg text-white/60">
            {loading ? t("common.loading") : t("statistics.no_data")}
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            {/* Overview */}
            <section {...sectionProps("overview")}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {tiles.map(({ icon: Icon, label, value }) => (
                  <div key={label}>
                    <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/55">
                      <Icon className="w-4 h-4" />
                      {label}
                    </p>
                    <p className="mt-2 text-4xl font-bold text-white tabular-nums whitespace-nowrap">{value}</p>
                  </div>
                ))}
              </div>
              {activeDays.length === 0 && (
                <p className="mt-6 text-base text-white/55">{t("statistics.no_sessions_recorded_title")}</p>
              )}
            </section>

            {/* Playtime by month */}
            <section {...sectionProps("monthly")}>
              {heading(t("console_ui.stats_monthly"))}
              <div className="flex items-end gap-2 lg:gap-4 h-56">
                {months.map((seconds, month) => (
                  <div key={month} className="flex-1 h-full flex flex-col items-center justify-end gap-2">
                    <span className="text-xs lg:text-sm text-white/70 tabular-nums whitespace-nowrap">
                      {seconds >= 3600 ? `${Math.round(seconds / 3600)}h` : seconds > 0 ? formatHours(seconds) : ""}
                    </span>
                    <div
                      className="w-full rounded-t-md"
                      style={{
                        height: `${(seconds / maxMonth) * 100}%`,
                        minHeight: seconds > 0 ? "0.25rem" : 0,
                        backgroundColor: seconds === maxMonth ? "var(--accent-primary)" : "rgba(255, 255, 255, 0.3)",
                      }}
                    />
                    <span className="text-sm uppercase tracking-wider text-white/55">{monthName(month)}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Activity heatmap */}
            <section {...sectionProps("activity")}>
              {heading(
                t("console_ui.stats_activity"),
                peakDay
                  ? `${t("statistics.highest_day")}: ${formatDay(peakDay.date, { day: "numeric", month: "long" })} · ${formatHours(peakDay.duration_seconds)}`
                  : t("statistics.no_sessions")
              )}
              <div className="flex gap-[0.2rem] overflow-hidden">
                {yearWeeks(year).map((week, w) => (
                  <div key={w} className="flex flex-col gap-[0.2rem] flex-1 min-w-0">
                    {week.map((date, d) => {
                      const seconds = date ? heatmap.get(date)?.duration_seconds ?? 0 : 0;
                      const level = seconds <= 0 ? 0 : seconds < 1800 ? 1 : seconds < 3600 ? 2 : seconds < 3 * 3600 ? 3 : 4;
                      return (
                        <div
                          key={d}
                          title={date ? `${formatDay(date, { day: "numeric", month: "short" })} · ${formatHours(seconds)}` : undefined}
                          className="aspect-square rounded-[0.15rem]"
                          style={{
                            backgroundColor: !date
                              ? "transparent"
                              : level === 0
                              ? "rgba(255, 255, 255, 0.06)"
                              : `color-mix(in srgb, var(--accent-primary) ${level * 25}%, rgba(255, 255, 255, 0.08))`,
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between text-sm text-white/55">
                <span>{t("statistics.active_days", { count: activeDays.length })}</span>
                <span className="flex items-center gap-1.5">
                  {t("statistics.less")}
                  {[0, 1, 2, 3, 4].map((level) => (
                    <span
                      key={level}
                      className="w-3.5 h-3.5 rounded-[0.15rem]"
                      style={{
                        backgroundColor:
                          level === 0
                            ? "rgba(255, 255, 255, 0.06)"
                            : `color-mix(in srgb, var(--accent-primary) ${level * 25}%, rgba(255, 255, 255, 0.08))`,
                      }}
                    />
                  ))}
                  {t("statistics.more")}
                </span>
              </div>
            </section>

            {/* Most played */}
            <section {...sectionProps("top")}>
              {heading(t("console_ui.stats_top_games"), t("statistics.all_time"))}
              {topGames.length === 0 ? (
                <p className="text-base text-white/50">{t("statistics.no_data")}</p>
              ) : (
                <div className="grid grid-cols-2 gap-x-10 gap-y-4">
                  {topGames.map((game, idx) => (
                    <div key={game.id} className="flex items-center gap-4 min-w-0">
                      <span className="w-6 text-right text-lg font-semibold text-white/45 tabular-nums">{idx + 1}</span>
                      <div className="w-12 aspect-[3/4] rounded overflow-hidden shrink-0 bg-black/40">
                        <ArtImage
                          sources={[game.cover_image, game.background_image]}
                          title={game.title}
                          library={game.library}
                          showFallbackTitle={false}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-lg text-white truncate">{game.title}</span>
                          <span className="text-base text-white/60 tabular-nums shrink-0">{game.playtime_formatted}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(game.playtime_seconds / topGames[0].playtime_seconds) * 100}%`,
                              backgroundColor: "var(--accent-primary)",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Store and genre breakdown */}
            <section {...sectionProps("breakdown")}>
              {heading(t("console_ui.stats_breakdown"))}
              <div className="grid grid-cols-2 gap-12">
                {renderShares(t("statistics.store_distribution"), stats.store_distribution, true)}
                {renderShares(t("statistics.genre_distribution"), stats.genre_distribution, false)}
              </div>
            </section>

            {/* Backlog */}
            {backlog && (
              <section {...sectionProps("backlog")}>
                {heading(
                  t("statistics.backlog_progress_title"),
                  t("statistics.games_ratio", { completed: backlog.completed_count, total: backlog.total_games })
                )}
                <div className="flex h-4 rounded-full overflow-hidden bg-white/10">
                  {backlogSegments.map((seg) =>
                    seg.count > 0 && backlog.total_games > 0 ? (
                      <div
                        key={seg.label}
                        style={{ width: `${(seg.count / backlog.total_games) * 100}%`, backgroundColor: seg.color }}
                      />
                    ) : null
                  )}
                </div>
                <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wider text-white/55">
                      {t("statistics.backlog_resolved")}
                    </p>
                    <p className="mt-2 text-4xl font-bold text-white tabular-nums">
                      {Math.round(backlog.completion_percentage)}%
                    </p>
                  </div>
                  {backlogSegments.map((seg) => (
                    <div key={seg.label}>
                      <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/55">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                        {seg.label}
                      </p>
                      <p className="mt-2 text-4xl font-bold text-white tabular-nums">{seg.count}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          soundEffects.playSelect();
          onClose();
        }}
        className="absolute top-6 right-10 z-20 cursor-pointer px-5 py-2 rounded-md border-none text-sm font-semibold uppercase tracking-wider text-white/80"
        style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}
      >
        {t("console_ui.back")}
      </button>
    </div>
  );
};
