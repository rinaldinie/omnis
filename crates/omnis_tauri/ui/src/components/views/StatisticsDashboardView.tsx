import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { GlobalStatsDto } from "../../types";
import ActivityHeatmapCalendar from "../stats/ActivityHeatmapCalendar";
import DistributionBar from "../stats/DistributionBar";
import QuickStatsCards from "../stats/QuickStatsCards";
import BacklogProgressCard from "../stats/BacklogProgressCard";
import ResetStatisticsModal from "../stats/ResetStatisticsModal";
import { RefreshCw, Sparkles, TrendingUp, Trash2, Check, Calendar } from "lucide-react";
import { useTranslation } from "../../i18n";
import soundEffects from "../../utils/soundEffects";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ActionTooltip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StatisticsDashboardViewProps {
  onSelectGame?: (gameId: string) => void;
}

export default function StatisticsDashboardView({
  onSelectGame,
}: StatisticsDashboardViewProps = {}) {
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

  const fetchStats = async (year: number) => {
    try {
      const res = await api.stats.getGlobalStatistics({ year });
      setStats(res);
      // Auto-adjust selectedYear if not in available years
      if (
        res.available_years &&
        res.available_years.length > 0 &&
        !res.available_years.includes(year)
      ) {
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
      await api.stats.resetStatistics({
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

  const availableYears = useMemo(() => {
    const list =
      stats?.available_years && stats.available_years.length > 0
        ? [...stats.available_years]
        : [currentYear, currentYear - 1];
    if (!list.includes(selectedYear)) {
      list.push(selectedYear);
    }
    return list.sort((a, b) => b - a);
  }, [stats?.available_years, selectedYear, currentYear]);

  return (
    <ScrollArea
      className="flex-1 transition-colors duration-300"
      style={{
        backgroundColor: "var(--bg-base)",
        color: "var(--text-primary)",
      }}
    >
      <div className="p-6 md:p-8 space-y-6">
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
                backgroundColor:
                  "color-mix(in srgb, var(--accent-primary, #6366f1) 15%, transparent)",
                borderColor:
                  "color-mix(in srgb, var(--accent-primary, #6366f1) 30%, transparent)",
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
          {/* Reset Statistics Button */}
          <ActionTooltip label={t("statistics.reset_button")}>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                soundEffects.playSelect();
                setShowResetModal(true);
              }}
              className="h-[34px] gap-1.5 px-3 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300"
              style={{
                backgroundColor: "color-mix(in srgb, #f43f5e 12%, transparent)",
                borderColor: "color-mix(in srgb, #f43f5e 30%, transparent)",
              }}
              aria-label={t("statistics.reset_button")}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t("statistics.reset_button")}</span>
            </Button>
          </ActionTooltip>

          {/* Dynamic Year Selector Dropdown */}
          <Select
            value={String(selectedYear)}
            onValueChange={(val) => {
              soundEffects.playSelect();
              setSelectedYear(Number(val));
            }}
          >
            <SelectTrigger
              title={t("statistics.select_year")}
              aria-label={t("statistics.select_year")}
              className="h-[34px] w-auto min-w-[100px] gap-2 px-3 rounded-xl text-xs font-semibold"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <Calendar
                className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0"
                aria-hidden="true"
              />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((yr) => (
                <SelectItem key={yr} value={String(yr)}>
                  {yr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Refresh button */}
          <ActionTooltip label={t("statistics.refresh_tooltip")}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-[34px] w-[34px] rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
              }}
              aria-label={t("statistics.refresh_tooltip")}
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
                style={{
                  color: refreshing ? "var(--accent-primary, #6366f1)" : undefined,
                }}
              />
            </Button>
          </ActionTooltip>
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
          <QuickStatsCards
            stats={stats}
            selectedYear={selectedYear}
            activeDaysCount={activeDaysCount}
            formatHours={formatHours}
          />

          {/* Information callout if sessions are 0 */}
          {activeDaysCount === 0 && (
            <div
              className="p-4 rounded-2xl border text-xs flex items-center gap-3 transition-colors"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--accent-primary, #6366f1) 8%, transparent)",
                borderColor:
                  "color-mix(in srgb, var(--accent-primary, #6366f1) 25%, transparent)",
              }}
            >
              <Sparkles className="w-5 h-5 shrink-0" style={{ color: "var(--accent-primary, #6366f1)" }} />
              <div>
                <span className="font-bold text-[var(--text-primary)] block">
                  {t("statistics.no_sessions_recorded_title") ||
                    "Nessuna sessione dettagliata registrata per questo anno"}
                </span>
                <span className="text-[var(--text-muted)] text-[11px] mt-0.5 block leading-relaxed">
                  {t("statistics.no_sessions_recorded_desc") ||
                    "Il calendario heatmap e la durata delle sessioni vengono tracciati automaticamente quando avvii i giochi tramite Omnis, oppure importando un backup Playnite con l'estensione GameActivity."}
                </span>
              </div>
            </div>
          )}

          {/* Section 1: Heatmap Activity */}
          <ActivityHeatmapCalendar
            activityData={stats.activity_heatmap}
            year={selectedYear}
            onSelectGame={onSelectGame}
          />

          {/* Section 2: Store & Genre Distributions */}
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

          {/* Section 3: Backlog Summary & Progress Bar */}
          <BacklogProgressCard backlogSummary={stats.backlog_summary} />
        </>
      ) : null}

      {/* Success Toast Notification */}
      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-xl bg-emerald-950/90 border-emerald-500/40 text-emerald-200 text-xs font-semibold backdrop-blur-md animate-in slide-in-from-bottom-5 duration-200">
          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <span>{t("statistics.reset_success")}</span>
        </div>
      )}

      {/* Reset Statistics Confirmation Modal */}
      <ResetStatisticsModal
        isOpen={showResetModal}
        resetOption={resetOption}
        setResetOption={setResetOption}
        resetting={resetting}
        onClose={() => setShowResetModal(false)}
        onConfirm={handleResetStatistics}
      />
      </div>
    </ScrollArea>
  );
}
