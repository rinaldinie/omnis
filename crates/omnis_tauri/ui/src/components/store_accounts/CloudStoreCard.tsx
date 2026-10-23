import React, { useState } from "react";
import { RefreshCw, LogIn, LogOut, Loader2, Clock, CheckCircle2, AlertCircle, Key } from "lucide-react";
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
  onSaveApiKey?: (storeId: string, apiKey: string) => Promise<void>;
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
  onSaveApiKey,
}) => {
  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>("");
  const [isSavingKey, setIsSavingKey] = useState<boolean>(false);

  const isSyncing = account.is_syncing || syncProgress?.status === "syncing";
  const isLightAccent =
    accentColor.toLowerCase() === "#ffffff" ||
    accentColor.toLowerCase() === "#fff" ||
    accentColor.toLowerCase() === "white";
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
        <div className="flex items-start justify-between pb-3 border-b border-white/10 gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center border shadow-md shrink-0"
              style={{
                backgroundColor: `${accentColor}26`,
                borderColor: `${accentColor}66`,
                color: accentColor,
              }}
            >
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h5 className="text-sm font-bold text-white truncate leading-tight">
                  {account.name}
                </h5>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0 uppercase tracking-wider ${badgeBg} ${badgeText}`}>
                  Cloud API
                </span>
              </div>
              <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                {subtitle}
              </p>
            </div>
          </div>

          <div className="shrink-0 pt-0.5">
            {account.is_connected ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Connesso
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30 whitespace-nowrap">
                Non connesso
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="py-3 space-y-2">
          {account.is_connected ? (
            <>
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

              {/* Steam Web API Key Section (Requirement D5) */}
              {account.store_id === "steam" && (
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                      <Key className="w-3.5 h-3.5 text-sky-400" />
                      Steam Web API Key:
                    </span>
                    {account.has_api_key ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" /> Configurato
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                        <AlertCircle className="w-3 h-3" /> Richiesto per Cloud
                      </span>
                    )}
                  </div>

                  {!showKeyInput && (
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-slate-400 leading-tight">
                        {account.has_api_key
                          ? "API Key attiva nel vault"
                          : "Necessaria per scaricare tutti i giochi non installati."}
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowKeyInput(true)}
                        className="text-[10px] font-bold text-sky-400 hover:text-sky-300 underline underline-offset-2 shrink-0 ml-2"
                      >
                        {account.has_api_key ? "Modifica" : "Inserisci Chiave"}
                      </button>
                    </div>
                  )}

                  {showKeyInput && (
                    <div className="space-y-1.5 p-2 rounded-xl bg-black/40 border border-white/15 text-[11px]">
                      <div className="flex gap-1.5">
                        <input
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="Incolla chiave 32 caratteri"
                          className="flex-1 min-w-0 bg-black/60 border border-white/20 rounded-lg px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 font-mono"
                        />
                        <button
                          type="button"
                          disabled={!apiKey.trim() || isSavingKey}
                          onClick={async () => {
                            if (onSaveApiKey && apiKey.trim()) {
                              setIsSavingKey(true);
                              try {
                                await onSaveApiKey("steam", apiKey.trim());
                                setShowKeyInput(false);
                                setApiKey("");
                              } finally {
                                setIsSavingKey(false);
                              }
                            }
                          }}
                          className="px-3 py-1 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs transition-colors shrink-0 flex items-center gap-1"
                        >
                          {isSavingKey ? <Loader2 className="w-3 h-3 animate-spin" /> : "Salva"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowKeyInput(false);
                            setApiKey("");
                          }}
                          className="px-2 py-1 bg-white/10 hover:bg-white/15 text-slate-300 rounded-lg text-xs transition-colors shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center justify-between">
                        <span>Richiedi la tua chiave gratuita:</span>
                        <a
                          href="https://steamcommunity.com/dev/apikey"
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 hover:underline inline-flex items-center gap-0.5"
                        >
                          steamcommunity.com/dev/apikey ↗
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-300 leading-relaxed">
              Autenticati per sincronizzare la libreria cloud e i giochi non installati.
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
            className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs shadow-lg transition-all hover:brightness-110 active:scale-98 disabled:opacity-50 ${isLightAccent ? "text-slate-950 font-black" : "text-white font-bold"
              }`}
            style={{
              backgroundColor: accentColor,
              boxShadow: `0 0 15px ${accentColor}4D`,
            }}
          >
            {actionLoading ? (
              <Loader2 className={`w-4 h-4 animate-spin ${isLightAccent ? "text-slate-950" : "text-white"}`} />
            ) : (
              <LogIn className={`w-4 h-4 ${isLightAccent ? "text-slate-950" : "text-white"}`} />
            )}
            <span>Connetti Account</span>
          </button>
        )}
      </div>
    </div>
  );
};
