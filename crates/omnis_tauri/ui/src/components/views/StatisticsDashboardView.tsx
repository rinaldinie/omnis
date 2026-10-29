import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GlobalStatsDto } from "../../types";
import ActivityHeatmapCalendar from "../stats/ActivityHeatmapCalendar";
import DistributionBar from "../stats/DistributionBar";
import {
  Clock,
  CheckCircle2,
  Calendar,
  Gamepad2,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";

export default function StatisticsDashboardView() {
  const currentYear = new Date().getUTCFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [stats, setStats] = useState<GlobalStatsDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchStats = async (year: number) => {
    try {
      const res = await invoke<GlobalStatsDto>("get_global_statistics", {
        year,
      });
      setStats(res);
    } catch (err) {
      console.error("Failed to load global statistics:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchStats(selectedYear);
  }, [selectedYear]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats(selectedYear);
  };

  const formatHours = (seconds: number) => {
    if (seconds <= 0) return "0 ore";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours} ore`;
    return `${hours}h ${mins}m`;
  };

  const activeDaysCount =
    stats?.activity_heatmap.filter((d) => d.duration_seconds > 0).length || 0;

  return (
    <div
      className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar"
      style={{
        backgroundColor: "var(--bg-primary, #0f1117)",
        color: "var(--text-primary, #f8fafc)",
      }}
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
              <span>Statistiche di Gioco</span>
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Analytics Hub
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Analisi approfondita dell'attività, distribuzione del tempo e avanzamento del backlog
          </p>
        </div>

        {/* Controls: Year Selector & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white/[0.04] p-1 rounded-xl border border-white/[0.08]">
            {[currentYear - 1, currentYear].map((yr) => (
              <button
                key={yr}
                onClick={() => setSelectedYear(yr)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedYear === yr
                    ? "bg-[var(--accent-primary,#6366f1)] text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {yr}
              </button>
            ))}
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white transition-all disabled:opacity-50"
            title="Aggiorna statistiche"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? "animate-spin text-emerald-400" : ""}`}
            />
          </button>
        </div>
      </div>

      {loading && !stats ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-white/[0.03] rounded-2xl border border-white/5" />
            ))}
          </div>
          <div className="h-64 bg-white/[0.03] rounded-2xl border border-white/5" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-white/[0.03] rounded-2xl border border-white/5" />
            <div className="h-64 bg-white/[0.03] rounded-2xl border border-white/5" />
          </div>
        </div>
      ) : stats ? (
        <>
          {/* Top KPI Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Ore totali giocate nell'anno */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-colors flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Tempo nell'Anno ({selectedYear})
                </span>
                <p className="text-xl font-extrabold text-white truncate">
                  {formatHours(stats.total_playtime_year_seconds)}
                </p>
                <span className="text-[11px] text-emerald-400 font-medium">
                  {Math.round(stats.total_playtime_year_seconds / 3600)} ore registrate
                </span>
              </div>
            </div>

            {/* Card 2: Giorni attivi */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-colors flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                <Calendar className="w-6 h-6 text-sky-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Giorni Giocati
                </span>
                <p className="text-xl font-extrabold text-white truncate">
                  {activeDaysCount}{" "}
                  <span className="text-xs text-slate-400 font-normal">/ 365</span>
                </p>
                <span className="text-[11px] text-sky-400 font-medium">
                  {Math.round((activeDaysCount / 365) * 100)}% dei giorni dell'anno
                </span>
              </div>
            </div>

            {/* Card 3: Backlog Smaltito */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-colors flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-amber-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Backlog Smaltito
                </span>
                <p className="text-xl font-extrabold text-white truncate">
                  {stats.backlog_summary.completion_percentage.toFixed(1)}%
                </p>
                <span className="text-[11px] text-amber-400 font-medium">
                  {stats.backlog_summary.completed_count} su {stats.backlog_summary.total_games} giochi
                </span>
              </div>
            </div>

            {/* Card 4: Titoli Totali & In Corso */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-colors flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                <Gamepad2 className="w-6 h-6 text-purple-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Titoli in Libreria
                </span>
                <p className="text-xl font-extrabold text-white truncate">
                  {stats.backlog_summary.total_games}
                </p>
                <span className="text-[11px] text-purple-400 font-medium">
                  {stats.backlog_summary.in_progress_count} in corso
                </span>
              </div>
            </div>
          </div>

          {/* Section 1: Heatmap Attività */}
          <ActivityHeatmapCalendar
            activityData={stats.activity_heatmap}
            year={selectedYear}
          />

          {/* Section 2: Distribuzione Store e Distribuzione Generi */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DistributionBar
              title="Distribuzione Tempo per Store"
              items={stats.store_distribution}
              type="store"
            />
            <DistributionBar
              title="Distribuzione Tempo per Genere"
              items={stats.genre_distribution}
              type="genre"
            />
          </div>

          {/* Section 3: Dettaglio Backlog Smaltito */}
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Avanzamento Smaltimento Backlog
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                {stats.backlog_summary.completed_count} Completati / Finiti •{" "}
                {stats.backlog_summary.in_progress_count} Iniziati •{" "}
                {stats.backlog_summary.not_played_count} Mai Giocati
              </span>
            </div>

            {/* Backlog Multi-Segment Progress Bar */}
            {stats.backlog_summary.total_games > 0 && (
              <div className="space-y-2">
                <div className="h-3.5 w-full rounded-full overflow-hidden flex bg-white/[0.04] p-0.5 border border-white/5">
                  {/* Completed / Beaten */}
                  <div
                    title={`Completati: ${stats.backlog_summary.completed_count} (${stats.backlog_summary.completion_percentage.toFixed(1)}%)`}
                    className="h-full bg-emerald-500 rounded-l-full transition-all duration-500"
                    style={{
                      width: `${(stats.backlog_summary.completed_count / stats.backlog_summary.total_games) * 100}%`,
                    }}
                  />
                  {/* In Progress */}
                  <div
                    title={`In Corso: ${stats.backlog_summary.in_progress_count}`}
                    className="h-full bg-amber-500 transition-all duration-500"
                    style={{
                      width: `${(stats.backlog_summary.in_progress_count / stats.backlog_summary.total_games) * 100}%`,
                    }}
                  />
                  {/* Not Played */}
                  <div
                    title={`Non Giocati: ${stats.backlog_summary.not_played_count}`}
                    className="h-full bg-slate-600 rounded-r-full transition-all duration-500"
                    style={{
                      width: `${(stats.backlog_summary.not_played_count / stats.backlog_summary.total_games) * 100}%`,
                    }}
                  />
                </div>

                {/* Legend badges */}
                <div className="flex items-center justify-between text-xs pt-1 flex-wrap gap-2 text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>
                      Completati: <strong>{stats.backlog_summary.completed_count}</strong> (
                      {stats.backlog_summary.completion_percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span>
                      Iniziati / In Corso: <strong>{stats.backlog_summary.in_progress_count}</strong> (
                      {(
                        (stats.backlog_summary.in_progress_count /
                          stats.backlog_summary.total_games) *
                        100
                      ).toFixed(1)}
                      %)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                    <span>
                      Non Giocati: <strong>{stats.backlog_summary.not_played_count}</strong> (
                      {(
                        (stats.backlog_summary.not_played_count /
                          stats.backlog_summary.total_games) *
                        100
                      ).toFixed(1)}
                      %)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
