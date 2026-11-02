import React from "react";
import { RefreshCw } from "lucide-react";
import { ActiveGameSession, AchievementSyncProgress } from "../../types";
import { ActiveGameStatusBarTicker } from "../../context/ActiveGameTimerContext";
import { AchievementSyncIndicator } from "../achievements";

export interface StatusBarProps {
  gamepadConnected: boolean;
  gamepadName?: string | null;
  activeGame: ActiveGameSession | null;
  formatDuration: (seconds: number) => string;
  handleKillRunningGame: () => void;
  isSyncing: boolean;
  statusMessage: string;
  achievementSync: AchievementSyncProgress | null;
  currentThemeName: string;
  t: (key: string, params?: Record<string, any>) => string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  gamepadConnected,
  gamepadName,
  activeGame,
  formatDuration,
  handleKillRunningGame,
  isSyncing,
  statusMessage,
  achievementSync,
  currentThemeName,
  t,
}) => {
  return (
    <footer
      className="h-7 min-h-[28px] max-h-[28px] border-t px-4 flex items-center justify-between text-[11px] font-medium select-none z-10 transition-colors duration-300"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-color)",
        color: "var(--text-muted)",
      }}
    >
      <div className="flex items-center gap-3 truncate">
        {gamepadConnected && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${
                activeGame
                  ? "bg-emerald-400 animate-pulse shadow-emerald-400/50 shadow-sm"
                  : "bg-emerald-400 shadow-sm"
              }`}
            />
            <span className="font-bold text-white">
              {gamepadName || t("console_ui.controller_connected")}
            </span>
          </div>
        )}

        {activeGame ? (
          <div className="flex items-center gap-2 truncate">
            <ActiveGameStatusBarTicker
              activeGame={activeGame}
              label={t("app_misc.now_playing")}
              formatDuration={formatDuration}
            />
            <button
              type="button"
              onClick={handleKillRunningGame}
              className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-600 hover:bg-rose-500 text-white transition-colors shrink-0 shadow-sm cursor-pointer"
              title={t("app_misc.kill_title")}
            >
              {t("app_misc.kill_short")}
            </button>
          </div>
        ) : isSyncing ? (
          <div className="flex items-center gap-2 truncate">
            <span className="text-sky-300 font-bold flex items-center gap-1.5 truncate">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
              <span className="truncate">{statusMessage || t("store_accounts.syncing")}</span>
            </span>
          </div>
        ) : (
          <span className="truncate">{statusMessage || t("app_status.ready")}</span>
        )}
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {achievementSync && <AchievementSyncIndicator sync={achievementSync} variant="footer" />}
        <span>{t("app_misc.fullscreen_hint")}</span>
        <span>
          {t("app_misc.active_theme")} <strong className="text-white">{currentThemeName}</strong>
        </span>
      </div>
    </footer>
  );
};
