import React, { useEffect, useState } from "react";
import { api } from "../../api";
import { GameDto, GameStatsDto } from "../../types";
import WeeklyBarChart from "./WeeklyBarChart";
import { Clock, Trophy, Activity, Hourglass } from "lucide-react";
import { useTranslation } from "../../i18n";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface GameStatisticsCardProps {
  game: GameDto;
}

export default function GameStatisticsCard({ game }: GameStatisticsCardProps) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<GameStatsDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isCancelled = false;
    setLoading(true);

    api.stats.getGameStatistics(game.id)
      .then((res) => {
        if (!isCancelled) {
          setStats(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.warn("Failed to fetch game statistics:", err);
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [game.id]);

  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return `0${t("statistics.min")}`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${mins}${t("statistics.min")}`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  if (loading) {
    return (
      <Card className="p-6 rounded-xl bg-white/[0.02] border-white/[0.06] space-y-4 shadow-none">
        <Skeleton className="h-4 w-32 rounded mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
        <Skeleton className="h-28 rounded-xl" />
      </Card>
    );
  }

  // Compute total playtime: sum of primary and all other copies if present, or game's playtime
  const totalPlaytimeSeconds =
    game.other_copies && game.other_copies.length > 0
      ? game.playtime_seconds +
        game.other_copies.reduce((acc, c) => acc + (c.playtime_seconds || 0), 0)
      : game.playtime_seconds;

  const totalFormatted =
    totalPlaytimeSeconds > 0 ? formatDuration(totalPlaytimeSeconds) : game.playtime_formatted || `0${t("statistics.min")}`;

  return (
    <Card className="p-6 rounded-xl bg-white/[0.02] border-white/[0.06] space-y-4 transition-colors duration-300 shadow-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider uppercase flex items-center gap-2 text-[var(--text-muted)]">
          <Activity className="w-3.5 h-3.5 text-indigo-400" />
          <span>{t("statistics.title")}</span>
        </span>
      </div>

      {/* Primary KPI Metrics: Total Time, Avg Session, Longest Session */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total Playtime (Complessivo) */}
        <div className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Hourglass className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block truncate">
              {t("statistics.total")}
            </span>
            <p className="text-sm font-bold text-white truncate">
              {totalFormatted}
            </p>
          </div>
        </div>

        {/* Average Session Duration */}
        <div className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block truncate">
              {t("statistics.avg_session_duration")}
            </span>
            <p className="text-sm font-bold text-white truncate">
              {stats ? formatDuration(stats.average_session_seconds) : `0${t("statistics.min")}`}
            </p>
          </div>
        </div>

        {/* Longest Session Ever Recorded */}
        <div className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block truncate">
              {t("statistics.longest_session")}
            </span>
            <p className="text-sm font-bold text-white truncate">
              {stats ? formatDuration(stats.longest_session_seconds) : `0${t("statistics.min")}`}
            </p>
          </div>
        </div>
      </div>

      {/* 4-Week Bar Chart */}
      {stats && stats.last_4_weeks_bars && stats.last_4_weeks_bars.length > 0 ? (
        <WeeklyBarChart weeks={stats.last_4_weeks_bars} />
      ) : (
        <p className="text-xs text-[var(--text-muted)] text-center py-2">
          {t("statistics.no_activity_4_weeks")}
        </p>
      )}
    </Card>
  );
}
