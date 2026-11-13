import React from "react";
import { BarChart3, CalendarDays, Clock, Flame, Hourglass } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../../api";
import { CategoryShareDto, DayActivityDto, GameDto, GlobalStatsDto, TranslateFn } from "../../types";
import soundEffects from "../../utils/soundEffects";
import { BACK_PRIORITY, useBackHandler } from "../../hooks/useBackHandler";
import { ArtImage } from "./FullscreenCards";
import { Glyph } from "./ConsoleChrome";
import { STORE_LABELS } from "./constants";
import { getLocalizedGenre } from "../../utils/genres";

const TOP_GAMES = 6;
const TOP_SHARES = 5;
const SECTIONS = ["overview", "monthly", "backlog", "activity", "top", "breakdown"] as const;
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
  locale: string;
  onClose?: () => void;
  t: TranslateFn;
}

export const FullscreenStatsPage: React.FC<FullscreenStatsPageProps> = ({
  isOpen,
  games,
  locale,
  onClose,
  t,
}) => {
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

  const stepYear = React.useCallback(
    (direction: number) => {
      const next = years[years.indexOf(year) + direction];
      if (next === undefined) return;
      soundEffects.playNav();
      setYear(next);
    },
    [years, year]
  );

  React.useEffect(() => {
    if (!isOpen) return;

    const handleNav = (e: Event) => {
      const dir = (e as CustomEvent<{ direction: "up" | "down" | "left" | "right" }>).detail?.direction;
      if (!dir) return;
      setFocused((prev) => {
        const idx = SECTIONS.indexOf(prev);
        let nextIdx = idx;
        if (dir === "down" || dir === "right") {
          nextIdx = Math.min(SECTIONS.length - 1, idx + 1);
        } else if (dir === "up" || dir === "left") {
          nextIdx = Math.max(0, idx - 1);
        }
        const next = SECTIONS[nextIdx];
        if (next !== prev) {
          soundEffects.playNav();
          sectionRefs.current[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        return next;
      });
    };
    const handleBumper = (e: Event) => {
      const direction = (e as CustomEvent<{ direction: number }>).detail?.direction ?? 1;
      stepYear(direction);
    };

    window.addEventListener("omnis:page-nav", handleNav);
    window.addEventListener("omnis:page-bumper", handleBumper);
    return () => {
      window.removeEventListener("omnis:page-nav", handleNav);
      window.removeEventListener("omnis:page-bumper", handleBumper);
    };
  }, [isOpen, stepYear]);

  useBackHandler(
    isOpen && !!onClose,
    () => {
      soundEffects.playSelect();
      onClose?.();
    },
    BACK_PRIORITY.PAGE
  );

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

  const canPrevYear = years.indexOf(year) > 0;
  const canNextYear = years.indexOf(year) < years.length - 1;

  const formatDay = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: "UTC" });
  const monthName = (month: number) =>
    new Date(Date.UTC(year, month, 1)).toLocaleDateString(locale, { month: "short", timeZone: "UTC" });

  const sectionProps = (id: Section, extraClass = "") => {
    const isFocused = focused === id;
    return {
      ref: (el: HTMLElement | null) => {
        sectionRefs.current[id] = el;
      },
      onClick: () => setFocused(id),
      className: `rounded-xl border scroll-my-6 transition-all duration-150 backdrop-blur-md ${extraClass}`,
      style: {
        backgroundColor: isFocused ? "rgba(255, 255, 255, 0.07)" : "rgba(255, 255, 255, 0.04)",
        borderColor: isFocused ? "rgba(255, 255, 255, 0.55)" : "rgba(255, 255, 255, 0.1)",
        boxShadow: isFocused ? "0 0 0 1px rgba(255, 255, 255, 0.28)" : "none",
      },
    };
  };

  const heading = (text: string, aside?: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-4 mb-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-white/55">{text}</h2>
      {aside && <span className="text-xs text-white/50 truncate">{aside}</span>}
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

  const renderShares = (title: string, items: CategoryShareDto[], isStore: boolean) => {
    let displayItems = items;
    if (!isStore) {
      const map = new Map<string, CategoryShareDto>();
      for (const item of items) {
        const localizedName = getLocalizedGenre(item.name, locale);
        const existing = map.get(localizedName);
        if (existing) {
          existing.duration_seconds += item.duration_seconds;
          existing.percentage += item.percentage;
        } else {
          map.set(localizedName, {
            name: localizedName,
            duration_seconds: item.duration_seconds,
            percentage: item.percentage,
          });
        }
      }
      displayItems = Array.from(map.values());
      displayItems.sort((a, b) => b.duration_seconds - a.duration_seconds);
    }

    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/65 mb-2.5">{title}</h3>
        {displayItems.length === 0 ? (
          <p className="text-xs text-white/50">{t("statistics.no_data")}</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {displayItems.slice(0, TOP_SHARES).map((item) => (
              <div key={item.name}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-white/90 font-medium truncate">
                    {isStore ? STORE_LABELS[item.name] ?? item.name : item.name}
                  </span>
                  <span className="text-white/55 tabular-nums shrink-0">
                    {formatHours(item.duration_seconds)} · {Math.round(item.percentage)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(item.percentage, 2)}%`, backgroundColor: "var(--accent-primary)" }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[45] flex flex-col omnis-fade-in backdrop-blur-xl"
      style={{
        backgroundColor: "color-mix(in srgb, var(--bg-base) 86%, transparent)",
        backgroundImage:
          "radial-gradient(ellipse at top, color-mix(in srgb, var(--accent-primary) 12%, transparent), transparent 60%)",
      }}
    >
      {/* Header matching console top bar proportions */}
      <header className="px-10 pt-6 pb-4 shrink-0 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5" style={{ color: "var(--accent-primary)" }} />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight truncate">
              {t("console_ui.statistics")}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/[0.07] border border-white/10 text-sm font-semibold text-white tabular-nums shrink-0">
            <button
              type="button"
              disabled={!canPrevYear}
              onClick={() => stepYear(-1)}
              aria-label="Previous year"
              className={`bg-transparent border-none p-0 inline-flex items-center text-inherit transition-opacity ${
                canPrevYear ? "cursor-pointer opacity-85 hover:opacity-100" : "opacity-30 cursor-default"
              }`}
            >
              <Glyph kind="lb" />
            </button>
            <span className={`px-1 ${loading ? "opacity-60" : ""}`}>{year}</span>
            <button
              type="button"
              disabled={!canNextYear}
              onClick={() => stepYear(1)}
              aria-label="Next year"
              className={`bg-transparent border-none p-0 inline-flex items-center text-inherit transition-opacity ${
                canNextYear ? "cursor-pointer opacity-85 hover:opacity-100" : "opacity-30 cursor-default"
              }`}
            >
              <Glyph kind="rb" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar px-10 pt-5 pb-20 scroll-pt-4 scroll-pb-20">
        {!stats ? (
          <p className="py-16 text-center text-base text-white/60">
            {loading ? t("common.loading") : t("statistics.no_data")}
          </p>
        ) : (
          <div className="max-w-7xl mx-auto flex flex-col gap-3.5">
            {/* Overview KPIs */}
            <section {...sectionProps("overview", "p-3.5")}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {tiles.map(({ icon: Icon, label, value }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-black/35 border border-white/5 min-w-0"
                  >
                    <div className="w-9 h-9 rounded-lg bg-white/[0.06] border border-white/5 flex items-center justify-center shrink-0 text-white/75">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50 truncate">
                        {label}
                      </p>
                      <p className="mt-0.5 text-xl font-bold text-white tabular-nums whitespace-nowrap leading-tight">
                        {value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {activeDays.length === 0 && (
                <p className="mt-3 text-xs text-white/55">{t("statistics.no_sessions_recorded_title")}</p>
              )}
            </section>

            {/* Monthly + Backlog */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
              <section {...sectionProps("monthly", "lg:col-span-7 p-4")}>
                {heading(t("console_ui.stats_monthly"))}
                <div className="flex items-end gap-2 h-28">
                  {months.map((seconds, month) => (
                    <div key={month} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5">
                      <span className="text-[10px] text-white/65 tabular-nums whitespace-nowrap leading-none">
                        {seconds >= 3600 ? `${Math.round(seconds / 3600)}h` : seconds > 0 ? formatHours(seconds) : ""}
                      </span>
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${(seconds / maxMonth) * 100}%`,
                          minHeight: seconds > 0 ? "0.2rem" : 0,
                          backgroundColor: seconds === maxMonth && seconds > 0 ? "var(--accent-primary)" : "rgba(255, 255, 255, 0.28)",
                        }}
                      />
                      <span className="text-[11px] uppercase tracking-wider text-white/50 leading-none">
                        {monthName(month)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {backlog && (
                <section {...sectionProps("backlog", "lg:col-span-5 p-4 flex flex-col justify-between")}>
                  {heading(
                    t("statistics.backlog_progress_title"),
                    t("statistics.games_ratio", { completed: backlog.completed_count, total: backlog.total_games })
                  )}
                  <div className="flex h-2.5 rounded-full overflow-hidden bg-white/10">
                    {backlogSegments.map((seg) =>
                      seg.count > 0 && backlog.total_games > 0 ? (
                        <div
                          key={seg.label}
                          style={{ width: `${(seg.count / backlog.total_games) * 100}%`, backgroundColor: seg.color }}
                        />
                      ) : null
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="px-2.5 py-2 rounded-lg bg-black/30 border border-white/5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50 truncate">
                        {t("statistics.backlog_resolved")}
                      </p>
                      <p className="mt-0.5 text-lg font-bold text-white tabular-nums leading-tight">
                        {Math.round(backlog.completion_percentage)}%
                      </p>
                    </div>
                    {backlogSegments.map((seg) => (
                      <div key={seg.label} className="px-2.5 py-2 rounded-lg bg-black/30 border border-white/5 min-w-0">
                        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50 truncate">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                          <span className="truncate">{seg.label}</span>
                        </p>
                        <p className="mt-0.5 text-lg font-bold text-white tabular-nums leading-tight">{seg.count}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Activity heatmap */}
            <section {...sectionProps("activity", "p-4")}>
              {heading(
                t("console_ui.stats_activity"),
                peakDay
                  ? `${t("statistics.highest_day")}: ${formatDay(peakDay.date, { day: "numeric", month: "long" })} · ${formatHours(peakDay.duration_seconds)}`
                  : t("statistics.no_sessions")
              )}
              <div className="flex gap-[2px] overflow-hidden">
                {yearWeeks(year).map((week, w) => (
                  <div key={w} className="flex flex-col gap-[2px] flex-1 min-w-0">
                    {week.map((date, d) => {
                      const seconds = date ? heatmap.get(date)?.duration_seconds ?? 0 : 0;
                      const level = seconds <= 0 ? 0 : seconds < 1800 ? 1 : seconds < 3600 ? 2 : seconds < 3 * 3600 ? 3 : 4;
                      return (
                        <div
                          key={d}
                          title={date ? `${formatDay(date, { day: "numeric", month: "short" })} · ${formatHours(seconds)}` : undefined}
                          className="aspect-square rounded-[2px]"
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
              <div className="mt-2.5 flex items-center justify-between text-xs text-white/50">
                <span>{t("statistics.active_days", { count: activeDays.length })}</span>
                <span className="flex items-center gap-1">
                  {t("statistics.less")}
                  {[0, 1, 2, 3, 4].map((level) => (
                    <span
                      key={level}
                      className="w-2.5 h-2.5 rounded-[2px]"
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

            {/* Most played + Store & genre breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
              <section {...sectionProps("top", "lg:col-span-6 p-4")}>
                {heading(t("console_ui.stats_top_games"), t("statistics.all_time"))}
                {topGames.length === 0 ? (
                  <p className="text-xs text-white/50">{t("statistics.no_data")}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
                    {topGames.map((game, idx) => (
                      <div key={game.id} className="flex items-center gap-2.5 min-w-0">
                        <span className="w-4 text-right text-xs font-semibold text-white/40 tabular-nums shrink-0">
                          {idx + 1}
                        </span>
                        <div className="w-8 aspect-[3/4] rounded overflow-hidden shrink-0 bg-black/40 border border-white/10">
                          <ArtImage
                            sources={[game.cover_image, game.background_image]}
                            title={game.title}
                            library={game.library}
                            showFallbackTitle={false}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-white truncate">{game.title}</span>
                            <span className="text-xs text-white/60 tabular-nums shrink-0">
                              {game.playtime_formatted}
                            </span>
                          </div>
                          <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
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

              <section {...sectionProps("breakdown", "lg:col-span-6 p-4")}>
                {heading(t("console_ui.stats_breakdown"))}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {renderShares(t("statistics.store_distribution"), stats.store_distribution, true)}
                  {renderShares(t("statistics.genre_distribution"), stats.genre_distribution, false)}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
