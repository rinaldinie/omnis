import React from "react";
import { RefreshCw, LogIn, LogOut, Loader2, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { StoreAccount, StoreSyncProgress, formatLastSync } from "./types";

interface CloudStoreCardProps {
  account: StoreAccount;
  subtitle: string;
  icon: React.ReactNode;
  bgGradient: string;
  borderColor: string;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
  actionLoading: boolean;
  syncProgress?: StoreSyncProgress;
  onConnect: (storeId: string) => void;
  onDisconnect: (storeId: string) => void;
  onSync: (storeId: string) => void;
}

export const CloudStoreCard: React.FC<CloudStoreCardProps> = ({
  account,
  subtitle,
  icon,
  bgGradient,
  borderColor,
  accentColor,
  badgeBg,
  badgeText,
  actionLoading,
  syncProgress,
  onConnect,
  onDisconnect,
  onSync,
}) => {
  const isSyncing = syncProgress?.status === "syncing";
  const progressPercent =
    syncProgress && syncProgress.total > 0
      ? Math.round((syncProgress.current / syncProgress.total) * 100)
      : isSyncing
      ? 45
      : 0;

  return (
    <div
      className="p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between"
      style={{
        background: bgGradient,
        borderColor: account.is_connected ? borderColor : "rgba(255, 255, 255, 0.1)",
        boxShadow: account.is_connected ? `0 4px 20px ${accentColor}26` : undefined,
      }}
    >
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center border shadow-md"
              style={{
                backgroundColor: `${accentColor}26`,
                borderColor: `${accentColor}66`,
                color: accentColor,
              }}
            >
              {icon}
            </div>
            <div>
              <h5 className="text-sm font-bold text-white flex items-center gap-1.5">
                {account.name}
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${badgeBg} ${badgeText}`}>
                  Cloud API
                </span>
              </h5>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {subtitle}
              </span>
            </div>
          </div>

          {account.is_connected ? (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Connesso
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30">
              Non connesso
            </span>
          )}
        </div>

        {/* Body */}
        <div className="py-3 space-y-2">
          {account.is_connected ? (
            <div className="flex items-center gap-3">
              {account.avatar_url ? (
                <img
                  src={account.avatar_url}
                  alt="Avatar"
                  className="w-10 h-10 rounded-full border object-cover"
                  style={{ borderColor: `${accentColor}66` }}
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-full border flex items-center justify-center font-bold text-sm"
                  style={{
                    backgroundColor: `${accentColor}33`,
                    borderColor: `${accentColor}66`,
                    color: "white",
                  }}
                >
                  {account.username ? account.username.charAt(0).toUpperCase() : account.store_id.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  {account.username || `Utente ${account.name}`}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>Ultimo sync: {formatLastSync(account.last_sync)}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-300 leading-relaxed">
              Autenticati via browser per sincronizzare la tua libreria completa con licenze cloud e giochi non installati.
            </p>
          )}

          {/* Progress / Status banner if active */}
          {syncProgress && syncProgress.status === "syncing" && (
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-indigo-300 font-medium">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                  {syncProgress.message || "Sincronizzazione in corso..."}
                </span>
                {syncProgress.total > 0 && (
                  <span className="font-mono text-xs">{syncProgress.current}/{syncProgress.total}</span>
                )}
              </div>
              <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {syncProgress && syncProgress.status === "completed" && (
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{syncProgress.message || "Sincronizzazione completata!"}</span>
            </div>
          )}

          {syncProgress && syncProgress.status === "error" && (
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{syncProgress.message || "Errore di sincronizzazione."}</span>
            </div>
          )}
        </div>
      </div>

      {/* Actions Footer */}
      <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
        {account.is_connected ? (
          <>
            <button
              type="button"
              disabled={actionLoading || isSyncing}
              onClick={() => onSync(account.store_id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              <span>{isSyncing ? "Sincronizzazione..." : "Sincronizza Ora"}</span>
            </button>
            <button
              type="button"
              disabled={actionLoading || isSyncing}
              onClick={() => onDisconnect(account.store_id)}
              className="flex items-center justify-center gap-1 py-1.5 px-3 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition-all disabled:opacity-50"
              title="Disconnetti account"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Disconnetti</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => onConnect(account.store_id)}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold text-white shadow-lg transition-all hover:brightness-110 active:scale-98 disabled:opacity-50"
            style={{
              backgroundColor: accentColor,
              boxShadow: `0 0 15px ${accentColor}4D`,
            }}
          >
            {actionLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            <span>Connetti Account</span>
          </button>
        )}
      </div>
    </div>
  );
};
