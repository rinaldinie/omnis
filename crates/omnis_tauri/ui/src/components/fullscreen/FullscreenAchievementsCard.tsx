import React from "react";
import { ChevronRight, Trophy } from "lucide-react";
import { GameAchievementsSummary } from "../../types";
import { achievementIconSrc } from "../achievements";
import { Glyph } from "./ConsoleChrome";

const RECENT_UNLOCKS = 6;

export interface FullscreenAchievementsCardProps {
  summary: GameAchievementsSummary | null;
  loading: boolean;
  library: string;
  isFocused: boolean;
  onOpen: () => void;
  t: (key: string, params?: Record<string, any>) => string;
}

/** Compact achievement progress on the console details page; opens the full achievements page. */
export const FullscreenAchievementsCard = React.forwardRef<HTMLButtonElement, FullscreenAchievementsCardProps>(
  function FullscreenAchievementsCard({ summary, loading, library, isFocused, onOpen, t }, ref) {
    const recent = React.useMemo(
      () =>
        (summary?.achievements ?? [])
          .filter((a) => a.is_unlocked)
          .sort((a, b) => (b.unlock_time ?? "").localeCompare(a.unlock_time ?? ""))
          .slice(0, RECENT_UNLOCKS),
      [summary]
    );
    const hasAchievements = !!summary && summary.total_count > 0;
    const percent = summary ? Math.round(summary.completion_percentage) : 0;

    return (
      <button
        ref={ref}
        type="button"
        onClick={hasAchievements ? onOpen : undefined}
        className={`w-full flex items-center gap-8 p-6 rounded-lg border-none text-left transition-shadow duration-200 ${
          hasAchievements ? "cursor-pointer" : "cursor-default"
        }`}
        style={{
          backgroundColor: isFocused ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.04)",
          boxShadow: isFocused ? "0 0 0 0.15rem rgba(255, 255, 255, 0.6)" : "none",
        }}
      >
        <div className="w-14 h-14 rounded-md flex items-center justify-center shrink-0 bg-amber-400/10 text-amber-300">
          <Trophy className="w-7 h-7" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-4">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-white/60">{t("achievements.title")}</h3>
            {hasAchievements && (
              <span className="text-lg font-semibold text-white tabular-nums">
                {summary.unlocked_count} / {summary.total_count}
                <span className="ml-2 text-white/55">· {percent}%</span>
              </span>
            )}
          </div>

          {hasAchievements ? (
            <>
              <div className="mt-3 h-1.5 max-w-xl rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(percent, 1)}%`, backgroundColor: "var(--accent-primary)" }}
                />
              </div>
              <div className="mt-4 flex items-center gap-3">
                {recent.length > 0 ? (
                  <>
                    <span className="text-sm text-white/50 mr-1">{t("console_ui.recent_unlocks")}</span>
                    {recent.map((ach) => (
                      <img
                        key={ach.id}
                        src={achievementIconSrc(ach)}
                        alt=""
                        title={ach.display_name}
                        loading="lazy"
                        className="w-11 h-11 rounded-md object-cover bg-slate-900"
                      />
                    ))}
                  </>
                ) : (
                  <span className="text-sm text-white/50">{t("console_ui.no_unlocks_yet")}</span>
                )}
              </div>
            </>
          ) : (
            <p className="mt-2 text-base text-white/55">
              {loading ? t("achievements.loading") : t("achievements.no_achievements", { store: library.toUpperCase() })}
            </p>
          )}
        </div>

        {hasAchievements && (
          <span className="flex items-center gap-2.5 shrink-0 text-base font-semibold uppercase tracking-wider text-white/80">
            {isFocused ? <Glyph kind="a" /> : null}
            {t("console_ui.view_all")}
            <ChevronRight className="w-5 h-5" />
          </span>
        )}
      </button>
    );
  }
);
