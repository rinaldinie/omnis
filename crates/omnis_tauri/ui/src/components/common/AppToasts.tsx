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
  return (
    <>
      {/* BACKGROUND ACHIEVEMENT SYNC (console mode has no status bar) */}
      {isFullscreen && achievementSync && (
        <AchievementSyncIndicator sync={achievementSync} variant="console" />
      )}

      {/* CLOUD STORE SYNC TOAST / FLOATING NOTIFICATION */}
      {syncBanner && (
        <div
          className="fixed top-14 right-6 z-50 flex items-center gap-3.5 p-3.5 rounded-2xl text-white shadow-2xl backdrop-blur-xl animate-in slide-in-from-top-4 duration-300 max-w-md border"
          style={{
            backgroundColor:
              syncBanner.status === "error"
                ? "rgba(225, 29, 72, 0.95)"
                : syncBanner.status === "completed"
                ? "rgba(16, 185, 129, 0.95)"
                : "rgba(15, 23, 42, 0.92)",
            borderColor:
              syncBanner.status === "error"
                ? "rgba(255, 150, 150, 0.4)"
                : syncBanner.status === "completed"
                ? "rgba(52, 211, 153, 0.5)"
                : "rgba(99, 102, 241, 0.4)",
            boxShadow:
              syncBanner.status === "completed"
                ? "0 10px 30px -5px rgba(16, 185, 129, 0.4)"
                : "0 10px 30px -5px rgba(0, 0, 0, 0.6)",
          }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border"
            style={{
              backgroundColor:
                syncBanner.status === "error"
                  ? "rgba(255, 255, 255, 0.2)"
                  : syncBanner.status === "completed"
                  ? "rgba(255, 255, 255, 0.2)"
                  : "rgba(99, 102, 241, 0.2)",
              borderColor: "rgba(255, 255, 255, 0.25)",
            }}
          >
            {syncBanner.status === "syncing" ? (
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
            ) : syncBanner.status === "completed" ? (
              <CheckCircle2 className="w-5 h-5 text-white" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                {syncBanner.storeName}
              </span>
              {syncBanner.status === "syncing" && syncBanner.total > 0 && (
                <span className="text-[10px] font-mono opacity-80">
                  {syncBanner.current}/{syncBanner.total}
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-white truncate mt-0.5">
              {syncBanner.message}
            </p>
          </div>
          <button
            onClick={onDismissSyncBanner}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title={t("app_misc.close_notification")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* DESKTOP SESSION END TOAST */}
      {!isFullscreen && sessionToast && (
        <div className="fixed bottom-10 right-6 z-50 flex items-center gap-3.5 p-4 rounded-2xl bg-slate-900/95 border border-emerald-500/50 text-white shadow-2xl shadow-emerald-950/50 backdrop-blur-xl animate-in slide-in-from-bottom-5 duration-300 max-w-md">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
            <Gamepad2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
              {t("app_misc.session_ended")}
            </span>
            <h4 className="text-xs font-bold text-white truncate">{sessionToast.title}</h4>
            <p className="text-[11px] text-slate-300 font-medium">
              {t("app_misc.played_time", {
                minutes: Math.max(1, Math.round(sessionToast.durationSeconds / 60)),
                duration: formatDuration(sessionToast.durationSeconds),
              })}
            </p>
          </div>
          <button
            onClick={onDismissSessionToast}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title={t("app_misc.close_notification")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* UPDATE NOTIFICATION TOAST */}
      {updater.status === "available" && (
        <div
          onClick={() => onOpenSettings("general")}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 p-4 rounded-2xl bg-slate-900/95 border border-sky-500/50 text-white shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5 cursor-pointer hover:border-sky-400 transition-all"
        >
          <Sparkles className="w-5 h-5 text-sky-400 shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-white">
              {t("general_settings.updater_available")}{" "}
              {updater.availableVersion ? `(v${updater.availableVersion})` : ""}
            </h4>
            <p className="text-[11px] text-slate-400">{t("topbar.options")}</p>
          </div>
        </div>
      )}
    </>
  );
};
