import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GameDto, GameStatsDto } from "../../types";
import WeeklyBarChart from "./WeeklyBarChart";
import { Clock, Trophy, Activity } from "lucide-react";
import { useTranslation } from "../../i18n";

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

    invoke<GameStatsDto>("get_game_statistics", { gameId: game.id })
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
      <div
        className="p-6 rounded-xl border animate-pulse space-y-4"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div
          className="h-4 w-32 rounded mb-4"
          style={{ backgroundColor: "var(--bg-surface)" }}
        />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div
            className="h-14 rounded-lg"
            style={{ backgroundColor: "var(--bg-surface)" }}
          />
          <div
            className="h-14 rounded-lg"
            style={{ backgroundColor: "var(--bg-surface)" }}
          />
        </div>
        <div
          className="h-28 rounded-lg"
          style={{ backgroundColor: "var(--bg-surface)" }}
        />
      </div>
    );
  }

  const hasData =
    stats &&
    (stats.average_session_seconds > 0 ||
      stats.longest_session_seconds > 0 ||
      stats.last_4_weeks_bars.some((w) => w.duration_seconds > 0));

  return (
    <div
      className="p-6 rounded-xl border space-y-4 transition-colors duration-300"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider uppercase flex items-center gap-2 text-[var(--text-muted)]">
          <Activity className="w-3.5 h-3.5" style={{ color: "var(--accent-primary, #6366f1)" }} />
          <span>{t("statistics.title")}</span>
        </span>
        {hasData && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full border font-medium"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent-primary, #6366f1) 15%, transparent)",
              borderColor: "color-mix(in srgb, var(--accent-primary, #6366f1) 30%, transparent)",
              color: "var(--accent-primary, #6366f1)",
            }}
          >
            {t("statistics.tracked_sessions")}
          </span>
        )}
      </div>

      {/* Primary KPI Metrics */}
      <div className="grid grid-cols-2 gap-3">
        {/* Average Session Duration */}
        <div
          className="p-3.5 rounded-xl border flex items-center gap-3"
          style={{
            backgroundColor: "color-mix(in srgb, var(--bg-surface) 60%, transparent)",
            borderColor: "var(--border-color)",
          }}
        >
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block truncate">
              {t("statistics.avg_session_duration")}
            </span>
            <p className="text-sm font-bold text-[var(--text-primary)] truncate">
              {stats ? formatDuration(stats.average_session_seconds) : `0${t("statistics.min")}`}
            </p>
          </div>
        </div>

        {/* Longest Session Ever Recorded */}
        <div
          className="p-3.5 rounded-xl border flex items-center gap-3"
          style={{
            backgroundColor: "color-mix(in srgb, var(--bg-surface) 60%, transparent)",
            borderColor: "var(--border-color)",
          }}
        >
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block truncate">
              {t("statistics.longest_session")}
            </span>
            <p className="text-sm font-bold text-[var(--text-primary)] truncate">
              {stats ? formatDuration(stats.longest_session_seconds) : `0${t("statistics.min")}`}
            </p>
          </div>
        </div>
      </div>

      {game.playtime_seconds > 0 && stats?.longest_session_seconds === 0 && (
        <div
          className="p-2.5 rounded-lg border text-[11px] text-[var(--text-muted)] flex items-center justify-between"
          style={{
            backgroundColor: "color-mix(in srgb, var(--bg-surface) 60%, transparent)",
            borderColor: "var(--border-color)",
          }}
        >
          <span>
            {t("statistics.total_imported_time")}: <strong className="text-[var(--text-primary)]">{game.playtime_formatted}</strong>
          </span>
          <span className="text-[var(--text-muted)] opacity-80">
            {t("statistics.detailed_sessions_hint")}
          </span>
        </div>
      )}

      {/* 4-Week Bar Chart */}
      {stats && stats.last_4_weeks_bars && stats.last_4_weeks_bars.length > 0 ? (
        <WeeklyBarChart weeks={stats.last_4_weeks_bars} />
      ) : (
        <p className="text-xs text-[var(--text-muted)] text-center py-2">
          {t("statistics.no_activity_4_weeks")}
        </p>
      )}
    </div>
  );
}
