import React from "react";
import { CheckCircle2, Gamepad2, Sparkles, Type } from "lucide-react";
import { GameDto, TranslateFn } from "../../types";
import type { AppUpdater } from "../../hooks/useAppUpdater";
import { SESSION_TOAST_MS } from "../../hooks/useAppEvents";
import { ArtImage } from "./FullscreenCards";
import { ControllerLegend, LegendEntry } from "./ConsoleChrome";

export interface FullscreenOverlaysProps {
  notice: string | null;
  sessionToast?: {
    title: string;
    durationSeconds: number;
    gameId: string;
  } | null;
  /** Library entry of the game whose session just ended (artwork and total playtime) */
  sessionGame?: GameDto | null;
  onDismissToast?: () => void;
  updater: AppUpdater | null;
  scaleHintVisible: boolean;
  scale: number;
  legendLeft: LegendEntry[];
  legendRight: LegendEntry[];
  t: TranslateFn;
}

/** "2h 05m" / "42 min" / "< 1 min" */
function sessionLength(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 1) return "< 1 min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes.toString().padStart(2, "0")}m` : `${minutes} min`;
}

export const FullscreenOverlays: React.FC<FullscreenOverlaysProps> = ({
  notice,
  sessionToast,
  sessionGame,
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

      {/* SESSION ENDED SUMMARY */}
      {sessionToast && (
        <div
          role="status"
          aria-live="polite"
          onClick={onDismissToast}
          className="fixed top-20 right-10 z-[55] w-[30rem] max-w-[calc(100vw-5rem)] overflow-hidden rounded-xl omnis-rise-in cursor-pointer select-none"
          style={{
            // Opaque even when the theme surface is translucent
            background: "linear-gradient(var(--bg-surface), var(--bg-surface)), var(--bg-base)",
            boxShadow: "0 24px 60px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
          }}
        >
          {sessionGame?.background_image && (
            <div className="absolute inset-0 opacity-25 pointer-events-none">
              <ArtImage
                sources={[sessionGame.background_image]}
                title={sessionGame.title}
                library={sessionGame.library}
                showFallbackTitle={false}
              />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(90deg, var(--bg-surface) 30%, transparent)" }}
              />
            </div>
          )}

          <div className="relative flex items-center gap-5 p-4">
            <div className="w-16 h-[5.5rem] rounded-md overflow-hidden shrink-0 bg-black/40 shadow-lg">
              {sessionGame ? (
                <ArtImage
                  sources={[sessionGame.cover_image, sessionGame.background_image]}
                  title={sessionGame.title}
                  library={sessionGame.library}
                  showFallbackTitle={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/50">
                  <Gamepad2 className="w-7 h-7" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--accent-primary)" }}>
                {t("fullscreen.session_ended")}
              </p>
              <p className="mt-0.5 text-xl font-bold text-white truncate">{sessionToast.title}</p>
              <div className="mt-2 flex items-end gap-6">
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-white/50">
                    {t("console_ui.session_time")}
                  </p>
                  <p className="text-2xl font-bold text-white tabular-nums leading-tight">
                    +{sessionLength(sessionToast.durationSeconds)}
                  </p>
                </div>
                {sessionGame && sessionGame.playtime_seconds > 0 && (
                  <div>
                    <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-white/50">
                      {t("console_ui.total_playtime")}
                    </p>
                    <p className="text-lg font-semibold text-white/80 tabular-nums leading-tight">
                      {sessionLength(sessionGame.playtime_seconds)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Time left before the summary goes away */}
          <div className="relative h-1 bg-white/10">
            <div
              key={`${sessionToast.gameId}-${sessionToast.durationSeconds}`}
              className="h-full omnis-drain"
              style={{ backgroundColor: "var(--accent-primary)", animationDuration: `${SESSION_TOAST_MS}ms` }}
            />
          </div>
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
