import React from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
  Gamepad2,
  Sparkles,
} from "lucide-react";
import { AchievementSyncProgress } from "../../types";
import { AchievementSyncIndicator } from "../achievements";
import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/components/ui/tooltip";

export interface SessionToastInfo {
  title: string;
  durationSeconds: number;
  gameId: string;
}

export interface SyncBannerInfo {
  storeId: string;
  storeName: string;
  message: string;
  current: number;
  total: number;
  status: "syncing" | "completed" | "error";
}

export interface AppToastsProps {
  isFullscreen: boolean;
  achievementSync: AchievementSyncProgress | null;
  syncBanner: SyncBannerInfo | null;
  onDismissSyncBanner: () => void;
  sessionToast: SessionToastInfo | null;
  onDismissSessionToast: () => void;
  formatDuration: (seconds: number) => string;
  updater: {
    status: string;
    availableVersion?: string | null;
  };
  onOpenSettings: (tab?: any) => void;
  t: (key: string, params?: Record<string, any>) => string;
}

export const AppToasts: React.FC<AppToastsProps> = ({
  isFullscreen,
  achievementSync,
  syncBanner,
  onDismissSyncBanner,
  sessionToast,
  onDismissSessionToast,
  formatDuration,
  updater,
  onOpenSettings,
  t,
}) => {
  const isUpdateAvailable = updater.status === "available";
  const hasDesktopToasts = Boolean(
    !isFullscreen && (syncBanner || sessionToast || isUpdateAvailable)
  );

  return (
    <>
      {/* BACKGROUND ACHIEVEMENT SYNC (console mode has no status bar) */}
      {isFullscreen && achievementSync && (
        <AchievementSyncIndicator sync={achievementSync} variant="console" />
      )}

      {/* FULLSCREEN CONSOLE CLOUD SYNC BANNER (if needed in console mode) */}
      {isFullscreen && syncBanner && (
        <div
          className="fixed top-8 right-8 z-50 flex items-center gap-2.5 px-3 py-2 border shadow-2xl backdrop-blur-xl omnis-rise-in max-w-sm pointer-events-auto"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-color)",
            borderRadius: "var(--card-radius)",
            color: "var(--text-primary)",
          }}
        >
          <div
            className="w-7 h-7 flex items-center justify-center shrink-0 border"
            style={{
              borderRadius: "calc(var(--card-radius) - 4px)",
              backgroundColor:
                syncBanner.status === "error"
                  ? "rgba(244, 63, 94, 0.15)"
                  : syncBanner.status === "completed"
                  ? "rgba(20, 184, 166, 0.15)"
                  : "rgba(99, 102, 241, 0.15)",
              borderColor:
                syncBanner.status === "error"
                  ? "rgba(244, 63, 94, 0.3)"
                  : syncBanner.status === "completed"
                  ? "rgba(20, 184, 166, 0.3)"
                  : "var(--accent-primary)",
            }}
          >
            {syncBanner.status === "syncing" ? (
              <RefreshCw
                className="w-3.5 h-3.5 animate-spin"
                style={{ color: "var(--accent-primary)" }}
              />
            ) : syncBanner.status === "completed" ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            )}
          </div>
          <div className="flex-1 min-w-0 leading-tight">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {syncBanner.storeName}
              </span>
              {syncBanner.status === "syncing" && syncBanner.total > 0 && (
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  {syncBanner.current}/{syncBanner.total}
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-[var(--text-primary)] truncate mt-0.5">
              {syncBanner.message}
            </p>
          </div>
          <ActionTooltip label={t("app_misc.close_notification")}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onDismissSyncBanner}
              className="h-6 w-6 p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5"
              aria-label={t("app_misc.close_notification")}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </ActionTooltip>
        </div>
      )}

      {/* DESKTOP UNIFIED TOAST STACK (Bottom-Right, non-colliding stack) */}
      {hasDesktopToasts && (
        <div
          className="fixed bottom-9 right-6 z-50 flex flex-col-reverse gap-2 max-w-sm w-full pointer-events-none select-none"
          role="region"
          aria-live="polite"
          aria-label={t("app_misc.notifications", { defaultValue: "Notifiche" })}
        >
          {/* 1. UPDATE NOTIFICATION */}
          {isUpdateAvailable && (
            <div
              onClick={() => onOpenSettings("general-updates")}
              className="relative overflow-hidden p-2.5 border shadow-xl backdrop-blur-xl omnis-rise-in flex items-center gap-2.5 text-xs pointer-events-auto cursor-pointer group transition-all"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
                borderRadius: "var(--card-radius)",
                color: "var(--text-primary)",
              }}
            >
              <div
                className="w-7 h-7 flex items-center justify-center shrink-0 border transition-transform group-hover:scale-105"
                style={{
                  borderRadius: "calc(var(--card-radius) - 4px)",
                  backgroundColor: "rgba(56, 189, 248, 0.15)",
                  borderColor: "rgba(56, 189, 248, 0.3)",
                  color: "#38bdf8",
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0 leading-tight">
                <h4 className="text-xs font-semibold text-[var(--text-primary)] truncate">
                  {t("general_settings.updater_available")}{" "}
                  {updater.availableVersion ? `(v${updater.availableVersion})` : ""}
                </h4>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {t("topbar.options")}
                </p>
              </div>
              <Button
                type="button"
                size="xs"
                className="h-auto px-2.5 py-1 text-[10px] font-bold shadow-sm shrink-0"
                style={{
                  borderRadius: "calc(var(--card-radius) - 6px)",
                  backgroundColor: "var(--accent-primary)",
                  color: "var(--bg-base)",
                }}
              >
                {t("general_settings.update_now", { defaultValue: "Aggiorna" })}
              </Button>
            </div>
          )}

          {/* 2. DESKTOP SESSION END TOAST */}
          {sessionToast && (
            <div
              className="relative overflow-hidden p-2.5 border shadow-xl backdrop-blur-xl omnis-rise-in flex items-center gap-2.5 text-xs pointer-events-auto group"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
                borderRadius: "var(--card-radius)",
                color: "var(--text-primary)",
              }}
            >
              <div
                className="w-7 h-7 flex items-center justify-center shrink-0 border"
                style={{
                  borderRadius: "calc(var(--card-radius) - 4px)",
                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                  borderColor: "rgba(16, 185, 129, 0.3)",
                  color: "#34d399",
                }}
              >
                <Gamepad2 className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0 leading-tight">
                <div className="flex items-center justify-between gap-1.5">
                  <h4 className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {sessionToast.title}
                  </h4>
                  <span className="text-[10px] font-mono text-emerald-400 font-medium shrink-0">
                    +{formatDuration(sessionToast.durationSeconds)}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
                  {t("app_misc.session_ended")} •{" "}
                  {t("app_misc.played_time", {
                    minutes: Math.max(1, Math.round(sessionToast.durationSeconds / 60)),
                    duration: formatDuration(sessionToast.durationSeconds),
                  })}
                </p>
              </div>
              <ActionTooltip label={t("app_misc.close_notification")}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onDismissSessionToast}
                  className="h-6 w-6 p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 shrink-0"
                  aria-label={t("app_misc.close_notification")}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </ActionTooltip>

              {/* Subtly animated progress drain countdown */}
              <div
                className="absolute bottom-0 left-0 right-0 h-[1.5px]"
                style={{ backgroundColor: "var(--border-color)" }}
              >
                <div
                  className="h-full omnis-drain"
                  style={{
                    backgroundColor: "var(--accent-primary)",
                    animationDuration: "6000ms",
                  }}
                />
              </div>
            </div>
          )}

          {/* 3. CLOUD STORE SYNC TOAST */}
          {syncBanner && (
            <div
              className="relative overflow-hidden p-2.5 border shadow-xl backdrop-blur-xl omnis-rise-in flex items-center gap-2.5 text-xs pointer-events-auto"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor:
                  syncBanner.status === "error"
                    ? "rgba(244, 63, 94, 0.4)"
                    : "var(--border-color)",
                borderRadius: "var(--card-radius)",
                color: "var(--text-primary)",
              }}
            >
              <div
                className="w-7 h-7 flex items-center justify-center shrink-0 border"
                style={{
                  borderRadius: "calc(var(--card-radius) - 4px)",
                  backgroundColor:
                    syncBanner.status === "error"
                      ? "rgba(244, 63, 94, 0.15)"
                      : syncBanner.status === "completed"
                      ? "rgba(20, 184, 166, 0.15)"
                      : "rgba(99, 102, 241, 0.15)",
                  borderColor:
                    syncBanner.status === "error"
                      ? "rgba(244, 63, 94, 0.3)"
                      : syncBanner.status === "completed"
                      ? "rgba(20, 184, 166, 0.3)"
                      : "var(--accent-primary)",
                }}
              >
                {syncBanner.status === "syncing" ? (
                  <RefreshCw
                    className="w-3.5 h-3.5 animate-spin"
                    style={{ color: "var(--accent-primary)" }}
                  />
                ) : syncBanner.status === "completed" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                )}
              </div>
              <div className="flex-1 min-w-0 leading-tight">
                <div className="flex items-center justify-between gap-1.5">
                  <h4 className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {syncBanner.storeName}
                  </h4>
                  {syncBanner.status === "syncing" && syncBanner.total > 0 && (
                    <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                      {syncBanner.current}/{syncBanner.total}
                    </span>
                  )}
                </div>
                <p
                  className={`text-[10px] mt-0.5 truncate ${
                    syncBanner.status === "error"
                      ? "text-rose-400"
                      : syncBanner.status === "completed"
                      ? "text-teal-400"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {syncBanner.message}
                </p>

                {/* Progress bar when syncing files */}
                {syncBanner.status === "syncing" && syncBanner.total > 0 && (
                  <div
                    className="w-full h-1 rounded-full overflow-hidden mt-1.5"
                    style={{ backgroundColor: "var(--border-color)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: "var(--accent-primary)",
                        width: `${Math.min(
                          100,
                          Math.max(5, (syncBanner.current / syncBanner.total) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>
              <ActionTooltip label={t("app_misc.close_notification")}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onDismissSyncBanner}
                  className="h-6 w-6 p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 shrink-0"
                  aria-label={t("app_misc.close_notification")}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </ActionTooltip>

              {/* Completed auto-dismiss indicator */}
              {syncBanner.status === "completed" && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-[1.5px]"
                  style={{ backgroundColor: "var(--border-color)" }}
                >
                  <div
                    className="h-full omnis-drain bg-teal-400"
                    style={{ animationDuration: "4000ms" }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};
