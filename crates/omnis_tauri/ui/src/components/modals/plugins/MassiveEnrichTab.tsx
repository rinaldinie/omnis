import React from "react";
import { Sparkles, ShieldCheck, Square } from "lucide-react";
import { MetadataPipelineConfig } from "../../../types";
import { useTranslation } from "../../../i18n";
import { Button } from "@/components/ui/button";

export interface MassiveEnrichTabProps {
  gamesCount: number;
  gamesWithCoverCount: number;
  gamesWithScoreCount: number;
  pipelineConfig: MetadataPipelineConfig;
  isPipelineEnriching: boolean;
  liveProgress: { current: number; total: number; title: string } | null;
  pipelineProgress: string | null;
  onRunMassivePipeline: () => void;
  onCancelPipeline?: () => void;
}

export const MassiveEnrichTab: React.FC<MassiveEnrichTabProps> = ({
  gamesCount,
  gamesWithCoverCount,
  gamesWithScoreCount,
  pipelineConfig,
  isPipelineEnriching,
  liveProgress,
  pipelineProgress,
  onRunMassivePipeline,
  onCancelPipeline,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <div
        className="p-5 rounded-2xl border space-y-3"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white"
            style={{ backgroundColor: "var(--accent-primary)" }}
          >
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-black text-white">
              {t("plugin_manager.enrich_title")}
            </h4>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("plugin_manager.enrich_desc", { count: gamesCount })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="p-3 rounded-lg bg-black/20 border border-white/5">
            <span className="text-[10px] uppercase font-bold text-slate-400">
              {t("plugin_manager.total_games")}
            </span>
            <p className="text-lg font-black text-white mt-0.5">{gamesCount}</p>
          </div>
          <div className="p-3 rounded-lg bg-black/20 border border-white/5">
            <span className="text-[10px] uppercase font-bold text-slate-400">
              {t("plugin_manager.covers_present")}
            </span>
            <p className="text-lg font-black text-emerald-400 mt-0.5">
              {gamesWithCoverCount}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-black/20 border border-white/5">
            <span className="text-[10px] uppercase font-bold text-slate-400">
              {t("plugin_manager.critic_scores")}
            </span>
            <p className="text-lg font-black text-amber-400 mt-0.5">
              {gamesWithScoreCount}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-xl bg-black/30 border border-white/5 text-[11px]">
          <ShieldCheck
            className={`w-4 h-4 shrink-0 ${
              pipelineConfig.preserve_existing_artwork !== false
                ? "text-emerald-400"
                : "text-amber-400"
            }`}
          />
          <span style={{ color: "var(--text-muted)" }}>
            {pipelineConfig.preserve_existing_artwork !== false ? (
              <>
                <strong className="text-emerald-400 font-bold">{t("plugin_manager.protection_on")}</strong>{" "}
                {t("plugin_manager.protection_on_desc")}
              </>
            ) : (
              <>
                <strong className="text-amber-400 font-bold">{t("plugin_manager.warning")}</strong> {t("plugin_manager.warning_desc")}
              </>
            )}
          </span>
        </div>

        {/* REAL-TIME PROGRESS BAR */}
        {isPipelineEnriching && liveProgress && (
          <div className="p-4 rounded-xl border border-indigo-500/40 bg-indigo-500/10 space-y-2.5 animate-in fade-in">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-indigo-300 truncate max-w-[320px]">
                {t("plugin_manager.downloading_for", { title: liveProgress.title })}
              </span>
              <span className="font-bold text-white">
                {liveProgress.current} / {liveProgress.total} ({liveProgress.total > 0 ? Math.round((liveProgress.current / liveProgress.total) * 100) : 0}%)
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-400 shadow-sm"
                style={{
                  width: `${liveProgress.total > 0 ? Math.round((liveProgress.current / liveProgress.total) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {pipelineProgress && !isPipelineEnriching && (
          <div
            className="p-3 rounded-xl border text-xs font-medium"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
              color: "var(--accent-primary)",
            }}
          >
            {pipelineProgress}
          </div>
        )}

        <div className="pt-2 flex items-center gap-3">
          <Button
            type="button"
            onClick={onRunMassivePipeline}
            disabled={isPipelineEnriching}
            className="h-auto flex-1 py-3 rounded-xl font-black text-xs text-white shadow-lg gap-2 hover:brightness-110 active:opacity-90 disabled:opacity-75"
            style={{
              backgroundColor: "var(--accent-primary)",
              boxShadow: `0 0 20px var(--accent-glow)`,
            }}
          >
            <Sparkles
              className={`w-4 h-4 ${
                isPipelineEnriching ? "animate-spin text-amber-300" : ""
              }`}
            />
            <span>
              {isPipelineEnriching
                ? t("plugin_manager.downloading")
                : t("plugin_manager.download_all")}
            </span>
          </Button>

          {isPipelineEnriching && onCancelPipeline && (
            <Button
              type="button"
              variant="destructive"
              onClick={onCancelPipeline}
              className="h-auto px-5 py-3 rounded-xl font-black text-xs text-white bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/25 gap-2 active:scale-95 animate-pulse"
              title={t("plugin_manager.stop_title")}
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>{t("plugin_manager.stop")}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
