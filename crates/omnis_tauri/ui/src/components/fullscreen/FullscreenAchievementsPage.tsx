import React from "react";
import { Award, Lock, Sparkles, Trophy } from "lucide-react";
import { Achievement, GameAchievementsSummary, GameDto } from "../../types";
import { achievementIconSrc, RARE_PERCENT, ULTRA_RARE_PERCENT } from "../achievements";
import soundEffects from "../../utils/soundEffects";
import { ArtImage } from "./FullscreenCards";
import { Glyph } from "./ConsoleChrome";

type AchievementFilter = "all" | "unlocked" | "locked" | "ultrarare";
export type AchievementSort = "default" | "recent" | "rarity" | "name";
const SORTS: AchievementSort[] = ["default", "recent", "rarity", "name"];

const isUltraRare = (a: Achievement) => a.rarity_percentage !== null && a.rarity_percentage < ULTRA_RARE_PERCENT;

function rarityColor(percent: number | null): string {
  if (percent === null) return "rgba(255, 255, 255, 0.55)";
  if (percent < ULTRA_RARE_PERCENT) return "#fbbf24";
  if (percent < RARE_PERCENT) return "#67e8f9";
  return "rgba(255, 255, 255, 0.7)";
}

function sortAchievements(list: Achievement[], sort: AchievementSort): Achievement[] {
  const sorted = [...list];
  if (sort === "recent") {
    const time = (a: Achievement) => (a.is_unlocked && a.unlock_time ? new Date(a.unlock_time).getTime() : 0);
    sorted.sort((a, b) => Number(b.is_unlocked) - Number(a.is_unlocked) || time(b) - time(a));
  } else if (sort === "rarity") {
    sorted.sort((a, b) => (a.rarity_percentage ?? 101) - (b.rarity_percentage ?? 101));
  } else if (sort === "name") {
    sorted.sort((a, b) => a.display_name.localeCompare(b.display_name));
  }
  return sorted;
}

export interface FullscreenAchievementsPageProps {
  isOpen: boolean;
  game: GameDto | null;
  summary: GameAchievementsSummary | null;
  loading: boolean;
  onClose: () => void;
  /** Reports whether A currently reveals a secret achievement, for the controller legend */
  onCanRevealChange?: (canReveal: boolean) => void;
  locale: string;
  t: (key: string, params?: Record<string, any>) => string;
}

export const FullscreenAchievementsPage: React.FC<FullscreenAchievementsPageProps> = ({
  isOpen,
  game,
  summary,
  loading,
  onClose,
  onCanRevealChange,
  locale,
  t,
}) => {
  const [filter, setFilter] = React.useState<AchievementFilter>("all");
  const [sort, setSort] = React.useState<AchievementSort>("default");
  const [focusedIndex, setFocusedIndex] = React.useState(0);
  const [revealed, setRevealed] = React.useState<Set<string>>(() => new Set());
  const rowRefs = React.useRef<Array<HTMLDivElement | null>>([]);

  // Every opening starts from the top of the full list
  React.useEffect(() => {
    if (!isOpen) return;
    setFilter("all");
    setFocusedIndex(0);
    setRevealed(new Set());
  }, [isOpen, game?.id]);

  const achievements = React.useMemo(() => summary?.achievements ?? [], [summary]);
  const counts = React.useMemo(
    () => ({
      all: achievements.length,
      unlocked: achievements.filter((a) => a.is_unlocked).length,
      locked: achievements.filter((a) => !a.is_unlocked).length,
      ultrarare: achievements.filter(isUltraRare).length,
    }),
    [achievements]
  );
  const filters = React.useMemo<AchievementFilter[]>(
    () => ["all", "unlocked", "locked", ...(counts.ultrarare > 0 ? (["ultrarare"] as const) : [])],
    [counts.ultrarare]
  );

  const visible = React.useMemo(() => {
    const filtered = achievements.filter((a) =>
      filter === "unlocked" ? a.is_unlocked : filter === "locked" ? !a.is_unlocked : filter === "ultrarare" ? isUltraRare(a) : true
    );
    return sortAchievements(filtered, sort);
  }, [achievements, filter, sort]);

  const safeIndex = Math.min(focusedIndex, Math.max(0, visible.length - 1));
  const focused = visible[safeIndex];
  const isSecret = (a: Achievement) => a.is_hidden && !a.is_unlocked && !revealed.has(a.id);
  const canReveal = isOpen && !!focused && isSecret(focused);

  React.useEffect(() => {
    onCanRevealChange?.(canReveal);
  }, [canReveal, onCanRevealChange]);

  React.useEffect(() => {
    rowRefs.current[safeIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [safeIndex, filter, sort]);

  const cycleFilter = React.useCallback(
    (direction: number) => {
      setFilter((prev) => filters[(filters.indexOf(prev) + direction + filters.length) % filters.length]);
      setFocusedIndex(0);
      soundEffects.playNav();
    },
    [filters]
  );

  const cycleSort = React.useCallback(() => {
    setSort((prev) => SORTS[(SORTS.indexOf(prev) + 1) % SORTS.length]);
    setFocusedIndex(0);
    soundEffects.playSelect();
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleNav = (e: Event) => {
      const dir = (e as CustomEvent<{ direction: "up" | "down" | "left" | "right" }>).detail?.direction;
      if (dir === "left" || dir === "right") {
        cycleFilter(dir === "right" ? 1 : -1);
        return;
      }
      setFocusedIndex((prev) => {
        const current = Math.min(prev, Math.max(0, visible.length - 1));
        const next = Math.max(0, Math.min(visible.length - 1, current + (dir === "down" ? 1 : -1)));
        if (next !== current) soundEffects.playNav();
        return next;
      });
    };
    const handleBumper = (e: Event) => cycleFilter((e as CustomEvent<{ direction: number }>).detail?.direction ?? 1);
    const handleReveal = () => {
      if (!canReveal || !focused) return;
      soundEffects.playSelect();
      setRevealed((prev) => new Set(prev).add(focused.id));
    };

    const events: Array<[string, EventListener]> = [
      ["omnis:page-nav", handleNav],
      ["omnis:page-bumper", handleBumper],
      ["omnis:page-action-y", cycleSort],
      ["omnis:page-action-a", handleReveal],
    ];
    events.forEach(([name, fn]) => window.addEventListener(name, fn));
    return () => events.forEach(([name, fn]) => window.removeEventListener(name, fn));
  }, [isOpen, visible.length, cycleFilter, cycleSort, canReveal, focused]);

  if (!isOpen || !game) return null;

  const percent = summary ? Math.round(summary.completion_percentage) : 0;
  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div className="fixed inset-0 z-[45] flex flex-col omnis-fade-in" style={{ backgroundColor: "var(--bg-base)" }}>
      <div className="absolute inset-x-0 top-0 h-[45vh] overflow-hidden pointer-events-none opacity-40">
        <ArtImage
          sources={[game.background_image, game.cover_image]}
          title={game.title}
          library={game.library}
          showFallbackTitle={false}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(0, 0, 0, 0.3) 0%, var(--bg-base) 100%)" }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-end gap-8 px-16 pt-14 pb-6">
        <div className="w-28 aspect-[3/4] rounded-md overflow-hidden shadow-2xl shrink-0 bg-black/40">
          <ArtImage sources={[game.cover_image, game.background_image]} title={game.title} library={game.library} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-white/60">
            <Trophy className="w-4 h-4 text-amber-300" />
            {t("achievements.title")}
          </p>
          <h1 className="mt-1 text-5xl font-bold text-white tracking-tight truncate">{game.title}</h1>
        </div>
        {summary && summary.total_count > 0 && (
          <div className="text-right shrink-0">
            <p className="text-5xl font-bold text-white tabular-nums">{percent}%</p>
            <p className="mt-1 text-lg text-white/70 tabular-nums">
              {summary.unlocked_count} / {summary.total_count} {t("achievements.unlocked").toLowerCase()}
              {summary.total_points > 0 && (
                <span className="ml-2 text-emerald-300 font-semibold">
                  {summary.earned_points} / {summary.total_points} G
                </span>
              )}
            </p>
          </div>
        )}
      </header>

      {summary && summary.total_count > 0 && (
        <div className="relative z-10 px-16">
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(percent, 1)}%`, backgroundColor: "var(--accent-primary)" }}
            />
          </div>

          {/* Filters and sort */}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-6 pb-4">
            <div className="flex flex-wrap items-center gap-3 text-base font-semibold">
              <Glyph kind="lb" />
              {filters.map((id) => {
                const active = id === filter;
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => {
                      soundEffects.playNav();
                      setFilter(id);
                      setFocusedIndex(0);
                    }}
                    className="cursor-pointer flex items-center gap-2 px-5 py-2 rounded-full border-none whitespace-nowrap transition-colors duration-150"
                    style={
                      active
                        ? { backgroundColor: "#ffffff", color: "#0b0f19" }
                        : { backgroundColor: "rgba(255, 255, 255, 0.08)", color: "rgba(255, 255, 255, 0.75)" }
                    }
                  >
                    {id === "ultrarare" && <Sparkles className="w-4 h-4 text-amber-400" />}
                    {t(id === "ultrarare" ? "achievements.ultra_rare" : `achievements.${id}`)}
                    <span className="tabular-nums opacity-60">{counts[id]}</span>
                  </button>
                );
              })}
              <Glyph kind="rb" />
            </div>
            <button
              type="button"
              onClick={cycleSort}
              className="cursor-pointer flex items-center gap-3 px-4 py-2 rounded-full border-none whitespace-nowrap text-base font-semibold text-white/85"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }}
            >
              <Glyph kind="y" />
              <span className="text-white/55">{t("console_ui.sort_by")}:</span>
              {t(`console_ui.achievement_sort_${sort}`)}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar px-16 pb-24 scroll-pt-4 scroll-pb-24">
        {loading && !summary ? (
          <p className="py-16 text-center text-lg text-white/60">{t("achievements.loading")}</p>
        ) : !summary || summary.total_count === 0 ? (
          <p className="py-16 text-center text-lg text-white/60">
            {t("achievements.no_achievements", { store: game.library.toUpperCase() })}
          </p>
        ) : visible.length === 0 ? (
          <p className="py-16 text-center text-lg text-white/60">{t("achievements.empty_filter")}</p>
        ) : (
          <div className="flex flex-col gap-2 py-2">
            {visible.map((ach, idx) => {
              const isFocused = idx === safeIndex;
              const secret = isSecret(ach);
              return (
                <div
                  key={ach.id}
                  ref={(el) => {
                    rowRefs.current[idx] = el;
                  }}
                  onClick={() => {
                    setFocusedIndex(idx);
                    if (secret) setRevealed((prev) => new Set(prev).add(ach.id));
                  }}
                  className="flex items-center gap-6 px-5 py-4 rounded-lg cursor-pointer transition-all duration-150"
                  style={{
                    backgroundColor: isFocused ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.03)",
                    boxShadow: isFocused ? "0 0 0 0.15rem rgba(255, 255, 255, 0.7)" : "none",
                  }}
                >
                  <AchievementIcon achievement={ach} secret={secret} />

                  <div className="flex-1 min-w-0">
                    <p className={`text-xl font-semibold truncate ${ach.is_unlocked ? "text-white" : "text-white/70"}`}>
                      {secret ? t("achievements.secret_title") : ach.display_name}
                    </p>
                    <p className="mt-1 text-base leading-snug text-white/60 line-clamp-2">
                      {secret ? t("achievements.secret_desc") : ach.description || t("achievements.no_desc")}
                    </p>
                  </div>

                  <div className="w-56 shrink-0 flex flex-col items-end gap-1 text-right">
                    {ach.rarity_percentage !== null && (
                      <span
                        className="flex items-center gap-1.5 text-base font-semibold tabular-nums"
                        style={{ color: rarityColor(ach.rarity_percentage) }}
                      >
                        {isUltraRare(ach) && <Sparkles className="w-4 h-4" />}
                        {t("console_ui.achievement_rarity", { percent: ach.rarity_percentage.toFixed(1) })}
                      </span>
                    )}
                    {ach.is_unlocked ? (
                      <span className="text-sm text-white/55">
                        {ach.unlock_time ? formatDate(ach.unlock_time) : t("achievements.unlocked")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm text-white/45">
                        <Lock className="w-3.5 h-3.5" />
                        {t("achievements.locked")}
                      </span>
                    )}
                    {ach.points !== null && (
                      <span className="text-sm font-semibold text-emerald-300 tabular-nums">{ach.points} G</span>
                    )}
                  </div>
                </div>
              );
            })}
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

function AchievementIcon({ achievement, secret }: { achievement: Achievement; secret: boolean }) {
  const [failed, setFailed] = React.useState(false);
  const src = achievementIconSrc(achievement);
  const ultraRare = achievement.is_unlocked && isUltraRare(achievement);

  return (
    <div
      className="relative w-16 h-16 rounded-md overflow-hidden shrink-0 bg-slate-900"
      style={{ boxShadow: ultraRare ? "0 0 0 0.15rem #fbbf24, 0 0 1rem rgba(251, 191, 36, 0.4)" : "none" }}
    >
      {secret ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
          <span className="text-2xl font-black leading-none">?</span>
        </div>
      ) : !failed && src ? (
        <img
          src={src}
          alt=""
          onError={() => setFailed(true)}
          loading="lazy"
          className={`w-full h-full object-cover ${achievement.is_unlocked ? "" : "grayscale opacity-40"}`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-slate-400">
          <Award className="w-7 h-7" />
        </div>
      )}
      {!achievement.is_unlocked && !secret && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Lock className="w-5 h-5 text-white/80 drop-shadow-md" />
        </div>
      )}
    </div>
  );
}
