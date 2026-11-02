import React from "react";
import { CheckCircle2, Gamepad2, Sparkles, Type } from "lucide-react";
import { ControllerLegend, LegendEntry } from "./ConsoleChrome";
import { duration } from "./constants";

export interface FullscreenOverlaysProps {
  notice: string | null;
  sessionToast?: {
    title: string;
    durationSeconds: number;
    gameId: string;
  } | null;
  onDismissToast?: () => void;
  updater: any;
  scaleHintVisible: boolean;
  scale: number;
  legendLeft: LegendEntry[];
  legendRight: LegendEntry[];
  t: (key: string, params?: Record<string, any>) => string;
}

export const FullscreenOverlays: React.FC<FullscreenOverlaysProps> = ({
  notice,
  sessionToast,
  onDismissToast,
  updater,
  scaleHintVisible,
  scale,
  legendLeft,
  legendRight,
  t,
}) => {
  return (
    <>
      {/* ACTION NOTICE */}
      {notice && (
        <div
          className="fixed top-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-lg shadow-2xl omnis-rise-in"
          style={{ backgroundColor: "var(--bg-surface)", borderLeft: "0.25rem solid #38bdf8" }}
        >
          <CheckCircle2 className="w-5 h-5 text-sky-300 shrink-0" />
          <span className="text-base font-medium text-white">{notice}</span>
        </div>
      )}

      {/* SESSION ENDED TOAST */}
      {sessionToast && (
        <div
          className="fixed top-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 pl-5 pr-3 py-3 rounded-lg shadow-2xl omnis-rise-in max-w-xl"
          style={{ backgroundColor: "var(--bg-surface)", borderLeft: "0.25rem solid #34d399" }}
        >
          <Gamepad2 className="w-7 h-7 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">
              {t("fullscreen.session_ended")}
            </p>
            <p className="text-lg font-semibold text-white truncate">{sessionToast.title}</p>
            <p className="text-sm text-white/65">
              {t("fullscreen.played_time")} {duration(sessionToast.durationSeconds)}
            </p>
          </div>
          {onDismissToast && (
            <button
              type="button"
              onClick={onDismissToast}
              className="ml-2 w-8 h-8 rounded-full flex items-center justify-center text-white/60"
              title={t("common.close")}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* UPDATE PROGRESS */}
      {updater && (updater.status === "downloading" || updater.status === "readyToInstall") && (
        <div
          className="fixed bottom-20 right-10 z-50 w-80 flex flex-col gap-3 p-4 rounded-lg shadow-2xl omnis-rise-in"
          style={{ backgroundColor: "var(--bg-surface)" }}
        >
          <div className="flex items-center gap-3">
            <Sparkles
              className={`w-5 h-5 text-sky-300 shrink-0 ${
                updater.status === "downloading" ? "animate-spin" : ""
              }`}
            />
            <span className="text-sm font-semibold text-white">
              {updater.status === "readyToInstall"
                ? t("general_settings.updater_ready_to_install")
                : `${t("general_settings.updater_downloading")} ${updater.progress?.percentage ?? 0}%`}
            </span>
          </div>
          {updater.status === "downloading" && (
            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-300"
                style={{ width: `${updater.progress?.percentage ?? 0}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* INTERFACE SCALE INDICATOR */}
      {scaleHintVisible && (
        <div
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-lg shadow-2xl omnis-fade-in"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
        >
          <Type className="w-6 h-6 text-white/70" />
          <span className="text-sm font-semibold uppercase tracking-wider text-white/70">
            {t("console_ui.ui_scale")}
          </span>
          <span className="text-2xl font-semibold text-white tabular-nums">
            {Math.round(scale * 100)}%
          </span>
        </div>
      )}

      {/* CONTROLLER LEGEND (always on top) */}
      <div className="relative z-50 mt-auto">
        <ControllerLegend left={legendLeft} right={legendRight} />
      </div>
    </>
  );
};
