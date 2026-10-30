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
  Trash2,
  AlertTriangle,
  Flame,
  X,
  Check,
} from "lucide-react";
import { useTranslation } from "../../i18n";
import soundEffects from "../../utils/soundEffects";

export default function StatisticsDashboardView() {
  const { t } = useTranslation();
  const currentYear = new Date().getUTCFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [stats, setStats] = useState<GlobalStatsDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Reset modal & toast state
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [resetOption, setResetOption] = useState<"sessions" | "all">("sessions");
  const [resetting, setResetting] = useState<boolean>(false);
  const [showToast, setShowToast] = useState<boolean>(false);

  // Keyboard accessibility: dismiss modal on Escape
  useEffect(() => {
    if (!showResetModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !resetting) {
        setShowResetModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showResetModal, resetting]);

  const fetchStats = async (year: number) => {
    try {
      const res = await invoke<GlobalStatsDto>("get_global_statistics", {
        year,
      });
      setStats(res);
      // Auto-adjust selectedYear if not in available years
      if (res.available_years && res.available_years.length > 0 && !res.available_years.includes(year)) {
        setSelectedYear(res.available_years[0]);
      }
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
    soundEffects.playSelect();
    setRefreshing(true);
    fetchStats(selectedYear);
  };

  const handleResetStatistics = async () => {
    try {
      setResetting(true);
      await invoke("reset_statistics", {
        resetPlaytime: resetOption === "all",
      });
      setShowResetModal(false);
      soundEffects.playUnlock();
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
      await fetchStats(selectedYear);
    } catch (err) {
      console.error("Failed to reset statistics:", err);
    } finally {
      setResetting(false);
    }
  };

  const formatHours = (seconds: number) => {
    if (seconds <= 0) return `0 ${t("statistics.hours")}`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${mins}${t("statistics.min")}`;
    if (mins === 0) return `${hours} ${t("statistics.hours")}`;
    return `${hours}h ${mins}m`;
  };

  const activeDaysCount =
    stats?.activity_heatmap.filter((d) => d.duration_seconds > 0).length || 0;

  const availableYears =
    stats?.available_years && stats.available_years.length > 0
      ? stats.available_years
      : [currentYear - 1, currentYear];

  return (
    <div
      className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar transition-colors duration-300"
      style={{
        backgroundColor: "var(--bg-base)",
        color: "var(--text-primary)",
      }}
    >
      {/* Top Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
              <TrendingUp className="w-6 h-6" style={{ color: "var(--accent-primary, #6366f1)" }} />
              <span>{t("statistics.title")}</span>
            </h1>
            <span
              className="text-xs px-2.5 py-0.5 rounded-full font-semibold border"
              style={{
                backgroundColor: "color-mix(in srgb, var(--accent-primary, #6366f1) 15%, transparent)",
                borderColor: "color-mix(in srgb, var(--accent-primary, #6366f1) 30%, transparent)",
                color: "var(--accent-primary, #6366f1)",
              }}
            >
              {t("statistics.hub_badge")}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {t("statistics.subtitle")}
          </p>
        </div>

        {/* Controls: Reset, Year Selector & Refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Button Azzera Statistiche */}
          <button
            onClick={() => {
              soundEffects.playSelect();
              setShowResetModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold text-rose-400 hover:text-rose-300 transition-all cursor-pointer"
            style={{
              backgroundColor: "color-mix(in srgb, #f43f5e 12%, transparent)",
              borderColor: "color-mix(in srgb, #f43f5e 30%, transparent)",
            }}
            title={t("statistics.reset_button")}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("statistics.reset_button")}</span>
          </button>

          {/* Dynamic Year Selector */}
          <div
            className="flex items-center p-1 rounded-xl border overflow-x-auto max-w-[280px] custom-scrollbar"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
            }}
          >
            {availableYears.map((yr) => (
              <button
                key={yr}
                onClick={() => {
                  soundEffects.playSelect();
                  setSelectedYear(yr);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  selectedYear === yr
                    ? "text-white shadow"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
                style={{
                  backgroundColor:
                    selectedYear === yr
                      ? "var(--accent-primary, #6366f1)"
                      : "transparent",
                }}
              >
                {yr}
              </button>
            ))}
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-xl border text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all disabled:opacity-50 cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
            }}
            title={t("statistics.refresh_tooltip")}
          >
            <RefreshCw
              className={`w-4 h-4 ${
                refreshing ? "animate-spin" : ""
              }`}
              style={{
                color: refreshing ? "var(--accent-primary, #6366f1)" : undefined,
              }}
            />
          </button>
        </div>
      </div>

      {loading && !stats ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-24 rounded-2xl border"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              />
            ))}
          </div>
          <div
            className="h-64 rounded-2xl border"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div
              className="h-64 rounded-2xl border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            />
            <div
              className="h-64 rounded-2xl border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            />
          </div>
        </div>
      ) : stats ? (
        <>
          {/* Top KPI Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Card 1: Tempo Totale Libreria (All-time / Lifetime) */}
            <div
              className="p-4 rounded-2xl border transition-colors flex items-center gap-4"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div
                className="w-12 h-12 rounded-xl border flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: "color-mix(in srgb, #f59e0b 15%, transparent)",
                  borderColor: "color-mix(in srgb, #f59e0b 30%, transparent)",
                }}
              >
                <Flame className="w-6 h-6 text-amber-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">
                  {t("statistics.lifetime_playtime") || "Tempo Totale Libreria"}
                </span>
                <p className="text-xl font-extrabold text-[var(--text-primary)] truncate">
                  {formatHours(stats.total_playtime_lifetime_seconds || stats.total_playtime_year_seconds)}
                </p>
                <span className="text-[11px] text-amber-400 font-medium">
                  {t("statistics.all_time") || "Totale Storico"}
                </span>
              </div>
            </div>

            {/* Card 2: Ore giocate nell'anno selezionato */}
            <div
              className="p-4 rounded-2xl border transition-colors flex items-center gap-4"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div
                className="w-12 h-12 rounded-xl border flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--accent-primary, #6366f1) 15%, transparent)",
                  borderColor: "color-mix(in srgb, var(--accent-primary, #6366f1) 30%, transparent)",
                }}
              >
                <Clock className="w-6 h-6" style={{ color: "var(--accent-primary, #6366f1)" }} />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">
                  {t("statistics.time_in_year", { year: selectedYear })}
                </span>
                <p className="text-xl font-extrabold text-[var(--text-primary)] truncate">
                  {formatHours(stats.total_playtime_year_seconds)}
                </p>
                <span
                  className="text-[11px] font-medium"
                  style={{ color: "var(--accent-primary, #6366f1)" }}
                >
                  {t("statistics.hours_registered", {
                    hours: Math.round(stats.total_playtime_year_seconds / 3600),
                  })}
                </span>
              </div>
            </div>

            {/* Card 3: Giorni attivi */}
            <div
              className="p-4 rounded-2xl border transition-colors flex items-center gap-4"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                <Calendar className="w-6 h-6 text-sky-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">
                  {t("statistics.days_played")}
                </span>
                <p className="text-xl font-extrabold text-[var(--text-primary)] truncate">
                  {activeDaysCount}{" "}
                  <span className="text-xs text-[var(--text-muted)] font-normal">/ 365</span>
                </p>
                <span className="text-[11px] text-sky-400 font-medium">
                  {t("statistics.percent_of_days", {
                    percent: Math.round((activeDaysCount / 365) * 100),
                  })}
                </span>
              </div>
            </div>

            {/* Card 4: Backlog Smaltito */}
            <div
              className="p-4 rounded-2xl border transition-colors flex items-center gap-4"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">
                  {t("statistics.backlog_resolved")}
                </span>
                <p className="text-xl font-extrabold text-[var(--text-primary)] truncate">
                  {stats.backlog_summary.completion_percentage.toFixed(1)}%
                </p>
                <span className="text-[11px] text-emerald-400 font-medium">
                  {t("statistics.games_ratio", {
                    completed: stats.backlog_summary.completed_count,
                    total: stats.backlog_summary.total_games,
                  })}
                </span>
              </div>
            </div>

            {/* Card 5: Titoli Totali & Iniziati */}
            <div
              className="p-4 rounded-2xl border transition-colors flex items-center gap-4"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                <Gamepad2 className="w-6 h-6 text-purple-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">
                  {t("statistics.titles_in_library")}
                </span>
                <p className="text-xl font-extrabold text-[var(--text-primary)] truncate">
                  {stats.backlog_summary.total_games}
                </p>
                <span className="text-[11px] text-purple-400 font-medium">
                  {t("statistics.in_progress", {
                    count: stats.backlog_summary.in_progress_count,
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Callout informatico se le sessioni per l'anno sono a 0 */}
          {activeDaysCount === 0 && (
            <div
              className="p-4 rounded-2xl border text-xs flex items-center gap-3 transition-colors"
              style={{
                backgroundColor: "color-mix(in srgb, var(--accent-primary, #6366f1) 8%, transparent)",
                borderColor: "color-mix(in srgb, var(--accent-primary, #6366f1) 25%, transparent)",
              }}
            >
              <Sparkles className="w-5 h-5 shrink-0" style={{ color: "var(--accent-primary, #6366f1)" }} />
              <div>
                <span className="font-bold text-[var(--text-primary)] block">
                  {t("statistics.no_sessions_recorded_title") || "Nessuna sessione dettagliata registrata per questo anno"}
                </span>
                <span className="text-[var(--text-muted)] text-[11px] mt-0.5 block leading-relaxed">
                  {t("statistics.no_sessions_recorded_desc") ||
                    "Il calendario heatmap e la durata delle sessioni vengono tracciati automaticamente quando avvii i giochi tramite Omnis, oppure importando un backup Playnite con l'estensione GameActivity."}
                </span>
              </div>
            </div>
          )}

          {/* Section 1: Heatmap Attività */}
          <ActivityHeatmapCalendar
            activityData={stats.activity_heatmap}
            year={selectedYear}
          />

          {/* Section 2: Distribuzione Store e Distribuzione Generi */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DistributionBar
              title={t("statistics.store_distribution")}
              items={stats.store_distribution}
              type="store"
            />
            <DistributionBar
              title={t("statistics.genre_distribution")}
              items={stats.genre_distribution}
              type="genre"
            />
          </div>

          {/* Section 3: Dettaglio Backlog Smaltito */}
          <div
            className="p-6 rounded-2xl border space-y-4 transition-colors duration-300"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  {t("statistics.backlog_progress_title")}
                </h3>
              </div>
              <span className="text-xs font-semibold text-[var(--text-muted)]">
                {stats.backlog_summary.completed_count} {t("statistics.completed_beaten")} •{" "}
                {stats.backlog_summary.in_progress_count} {t("statistics.started_in_progress")} •{" "}
                {stats.backlog_summary.not_played_count} {t("statistics.not_played")}
              </span>
            </div>

            {/* Backlog Multi-Segment Progress Bar */}
            {stats.backlog_summary.total_games > 0 && (
              <div className="space-y-2">
                <div
                  className="h-3.5 w-full rounded-full overflow-hidden flex p-0.5 border"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  {/* Completed / Beaten */}
                  <div
                    title={`${t("statistics.completed_beaten")}: ${stats.backlog_summary.completed_count} (${stats.backlog_summary.completion_percentage.toFixed(1)}%)`}
                    className="h-full bg-emerald-500 rounded-l-full transition-all duration-500"
                    style={{
                      width: `${(stats.backlog_summary.completed_count / stats.backlog_summary.total_games) * 100}%`,
                    }}
                  />
                  {/* In Progress */}
                  <div
                    title={`${t("statistics.started_in_progress")}: ${stats.backlog_summary.in_progress_count}`}
                    className="h-full bg-amber-500 transition-all duration-500"
                    style={{
                      width: `${(stats.backlog_summary.in_progress_count / stats.backlog_summary.total_games) * 100}%`,
                    }}
                  />
                  {/* Not Played */}
                  <div
                    title={`${t("statistics.not_played")}: ${stats.backlog_summary.not_played_count}`}
                    className="h-full rounded-r-full transition-all duration-500"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--border-color) 70%, transparent)",
                      width: `${(stats.backlog_summary.not_played_count / stats.backlog_summary.total_games) * 100}%`,
                    }}
                  />
                </div>

                {/* Legend badges */}
                <div className="flex items-center justify-between text-xs pt-1 flex-wrap gap-2 text-[var(--text-muted)]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>
                      {t("statistics.completed_beaten")}: <strong>{stats.backlog_summary.completed_count}</strong> (
                      {stats.backlog_summary.completion_percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span>
                      {t("statistics.started_in_progress")}: <strong>{stats.backlog_summary.in_progress_count}</strong> (
                      {(
                        (stats.backlog_summary.in_progress_count /
                          stats.backlog_summary.total_games) *
                        100
                      ).toFixed(1)}
                      %)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: "var(--border-color)" }}
                    />
                    <span>
                      {t("statistics.not_played")}: <strong>{stats.backlog_summary.not_played_count}</strong> (
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

      {/* TOAST DI SUCCESSO AZZERAMENTO */}
      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-xl bg-emerald-950/90 border-emerald-500/40 text-emerald-200 text-xs font-semibold backdrop-blur-md animate-in slide-in-from-bottom-5 duration-200">
          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <span>{t("statistics.reset_success")}</span>
        </div>
      )}

      {/* MODAL CONFERMA AZZERAMENTO STATISTICHE */}
      {showResetModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !resetting) {
              setShowResetModal(false);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
        >
          <div
            className="w-full max-w-md rounded-2xl border p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-rose-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 id="reset-modal-title" className="text-base font-bold text-[var(--text-primary)]">
                  {t("statistics.reset_title")}
                </h3>
              </div>
              <button
                onClick={() => !resetting && setShowResetModal(false)}
                disabled={resetting}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              {t("statistics.reset_confirm_msg")}
            </p>

            <div className="space-y-3">
              {/* Opzione 1: Solo sessioni */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  resetOption === "sessions"
                    ? "border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]"
                    : "border-[var(--border-color)] opacity-80 hover:opacity-100"
                }`}
                style={{ backgroundColor: "var(--bg-surface)" }}
              >
                <input
                  type="radio"
                  name="resetOption"
                  checked={resetOption === "sessions"}
                  onChange={() => setResetOption("sessions")}
                  className="mt-0.5"
                />
                <div className="text-xs">
                  <span className="font-bold text-[var(--text-primary)] block">
                    {t("statistics.reset_sessions_only")}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] block mt-0.5">
                    {t("statistics.reset_sessions_only_desc")}
                  </span>
                </div>
              </label>

              {/* Opzione 2: Sessioni e tempo di tutti i giochi */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  resetOption === "all"
                    ? "border-rose-500 ring-1 ring-rose-500"
                    : "border-[var(--border-color)] opacity-80 hover:opacity-100"
                }`}
                style={{ backgroundColor: "var(--bg-surface)" }}
              >
                <input
                  type="radio"
                  name="resetOption"
                  checked={resetOption === "all"}
                  onChange={() => setResetOption("all")}
                  className="mt-0.5"
                />
                <div className="text-xs">
                  <span className="font-bold text-rose-400 block">
                    {t("statistics.reset_all_playtime")}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] block mt-0.5">
                    {t("statistics.reset_all_playtime_desc")}
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                disabled={resetting}
                className="px-4 py-2 rounded-xl border text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                }}
              >
                {t("statistics.cancel")}
              </button>
              <button
                type="button"
                onClick={handleResetStatistics}
                disabled={resetting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {resetting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{t("statistics.confirm")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
