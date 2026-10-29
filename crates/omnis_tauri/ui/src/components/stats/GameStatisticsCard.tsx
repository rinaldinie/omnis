import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GameDto, GameStatsDto } from "../../types";
import WeeklyBarChart from "./WeeklyBarChart";
import { Clock, Trophy, Activity } from "lucide-react";

interface GameStatisticsCardProps {
  game: GameDto;
}

export default function GameStatisticsCard({ game }: GameStatisticsCardProps) {
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
    if (seconds <= 0) return "0m";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  if (loading) {
    return (
      <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] animate-pulse">
        <div className="h-4 w-32 bg-white/10 rounded mb-4" />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="h-14 bg-white/5 rounded-lg" />
          <div className="h-14 bg-white/5 rounded-lg" />
        </div>
        <div className="h-28 bg-white/5 rounded-lg" />
      </div>
    );
  }

  const hasData =
    stats &&
    (stats.average_session_seconds > 0 ||
      stats.longest_session_seconds > 0 ||
      stats.last_4_weeks_bars.some((w) => w.duration_seconds > 0));

  return (
    <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider uppercase flex items-center gap-2 text-[var(--text-muted)]">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span>Statistiche & Attività</span>
        </span>
        {hasData && (
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
            Sessioni tracciate
          </span>
        )}
      </div>

      {/* Primary KPI Metrics */}
      <div className="grid grid-cols-2 gap-3">
        {/* Average Session Duration */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block truncate">
              Durata Media Sessione
            </span>
            <p className="text-sm font-bold text-white truncate">
              {stats ? formatDuration(stats.average_session_seconds) : "0m"}
            </p>
          </div>
        </div>

        {/* Longest Session Ever Recorded */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block truncate">
              Sessione Più Lunga
            </span>
            <p className="text-sm font-bold text-white truncate">
              {stats ? formatDuration(stats.longest_session_seconds) : "0m"}
            </p>
          </div>
        </div>
      </div>

      {game.playtime_seconds > 0 && stats?.longest_session_seconds === 0 && (
        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[11px] text-slate-400 flex items-center justify-between">
          <span>
            Tempo complessivo: <strong className="text-white">{game.playtime_formatted}</strong>
          </span>
          <span className="text-slate-500">
            Sessioni dettagliate al prossimo avvio
          </span>
        </div>
      )}

      {/* 4-Week Bar Chart */}
      {stats && stats.last_4_weeks_bars && stats.last_4_weeks_bars.length > 0 ? (
        <WeeklyBarChart weeks={stats.last_4_weeks_bars} />
      ) : (
        <p className="text-xs text-slate-500 text-center py-2">
          Nessuna attività registrata nelle ultime 4 settimane
        </p>
      )}
    </div>
  );
}
