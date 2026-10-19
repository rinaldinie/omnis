import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  LogOut,
  LogIn,
  Cloud,
  ShieldCheck,
  Check,
  Loader2,
  Clock,
  HardDrive,
  Sparkles,
  Info,
  Gamepad2,
} from "lucide-react";
import { SteamIcon, EpicIcon, GogIcon, XboxIcon } from "./StoreBadge";
import soundEffects from "../utils/soundEffects";

export interface StoreAccount {
  store_id: string;
  name: string;
  is_connected: boolean;
  username: string | null;
  avatar_url: string | null;
  last_sync: string | null;
}

export interface StoreSyncProgress {
  store_id: string;
  current: number;
  total: number;
  status: string; // 'syncing' | 'completed' | 'error'
  message?: string;
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<T>(cmd, args);
    }
  } catch (err) {
    console.warn(`Tauri command '${cmd}' not available:`, err);
  }
  return null;
}

async function listenTauri<T>(event: string, handler: (payload: T) => void): Promise<(() => void) | null> {
  try {
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      const { listen } = await import("@tauri-apps/api/event");
      return await listen<T>(event, (e) => handler(e.payload));
    }
  } catch (err) {
    console.warn(`Tauri listen '${event}' not available:`, err);
  }
  return null;
}

function formatLastSync(isoStr: string | null | undefined): string {
  if (!isoStr) return "Mai sincronizzato";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

const DEFAULT_ACCOUNTS: StoreAccount[] = [
  {
    store_id: "gog",
    name: "GOG Galaxy",
    is_connected: false,
    username: null,
    avatar_url: null,
    last_sync: null,
  },
  {
    store_id: "xbox",
    name: "Xbox / PC Game Pass",
    is_connected: false,
    username: null,
    avatar_url: null,
    last_sync: null,
  },
  {
    store_id: "steam",
    name: "Steam",
    is_connected: true,
    username: "Rilevato su disco locale (VDF manifest)",
    avatar_url: null,
    last_sync: null,
  },
  {
    store_id: "epic",
    name: "Epic Games Store",
    is_connected: true,
    username: "Rilevato su disco locale (Manifest .item)",
    avatar_url: null,
    last_sync: null,
  },
];

const FUTURE_STORES = [
  {
    id: "ea",
    name: "EA App",
    publisher: "Electronic Arts",
    color: "#ff4747",
    tag: "Prossimamente / Cloud OAuth",
  },
  {
    id: "ubisoft",
    name: "Ubisoft Connect",
    publisher: "Ubisoft",
    color: "#0070d1",
    tag: "Prossimamente / Cloud OAuth",
  },
  {
    id: "battlenet",
    name: "Battle.net",
    publisher: "Blizzard Entertainment",
    color: "#00aeff",
    tag: "Prossimamente / Cloud OAuth",
  },
  {
    id: "itch",
    name: "itch.io",
    publisher: "Indie Games Platform",
    color: "#fa5c5c",
    tag: "Prossimamente / Cloud OAuth",
  },
  {
    id: "amazon",
    name: "Amazon Games",
    publisher: "Amazon Prime Gaming",
    color: "#ff9900",
    tag: "Prossimamente / Cloud OAuth",
  },
];

interface StoreAccountsTabProps {
  onSyncComplete?: () => void;
}

export const StoreAccountsTab: React.FC<StoreAccountsTabProps> = ({ onSyncComplete }) => {
  const [accounts, setAccounts] = useState<StoreAccount[]>(DEFAULT_ACCOUNTS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [syncProgress, setSyncProgress] = useState<Record<string, StoreSyncProgress>>({});
  const [banner, setBanner] = useState<{ type: "success" | "info" | "error"; message: string } | null>(null);

  const loadAccounts = async () => {
    setIsLoading(true);
    try {
      const res = await invokeTauri<StoreAccount[]>("get_store_accounts");
      if (res && Array.isArray(res) && res.length > 0) {
        setAccounts(res);
      } else {
        setAccounts(DEFAULT_ACCOUNTS);
      }
    } catch (e) {
      console.error("Failed loading store accounts:", e);
      setAccounts(DEFAULT_ACCOUNTS);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();

    let unlistenConnected: (() => void) | null = null;
    let unlistenDisconnected: (() => void) | null = null;
    let unlistenProgress: (() => void) | null = null;

    (async () => {
      unlistenConnected = await listenTauri<{ store_id: string; username?: string }>(
        "store-account-connected",
        (payload) => {
          soundEffects.playSelect();
          setBanner({
            type: "success",
            message: `Account ${payload.username ? `"${payload.username}"` : payload.store_id.toUpperCase()} collegato con successo!`,
          });
          loadAccounts();
          if (onSyncComplete) onSyncComplete();
        }
      );

      unlistenDisconnected = await listenTauri<{ store_id: string }>(
        "store-account-disconnected",
        (payload) => {
          soundEffects.playSelect();
          setBanner({
            type: "info",
            message: `Account ${payload.store_id.toUpperCase()} disconnesso.`,
          });
          setSyncProgress((prev) => {
            const next = { ...prev };
            delete next[payload.store_id];
            return next;
          });
          loadAccounts();
          if (onSyncComplete) onSyncComplete();
        }
      );

      unlistenProgress = await listenTauri<StoreSyncProgress>(
        "store-sync-progress",
        (payload) => {
          setSyncProgress((prev) => ({
            ...prev,
            [payload.store_id]: payload,
          }));
          if (payload.status === "completed") {
            loadAccounts();
            if (onSyncComplete) onSyncComplete();
          }
        }
      );
    })();

    return () => {
      if (unlistenConnected) unlistenConnected();
      if (unlistenDisconnected) unlistenDisconnected();
      if (unlistenProgress) unlistenProgress();
    };
  }, []);

  const handleConnect = async (storeId: string) => {
    soundEffects.playSelect();
    setActionLoading((prev) => ({ ...prev, [storeId]: true }));
    try {
      setBanner({
        type: "info",
        message: `Apertura finestra di autenticazione OAuth per ${storeId.toUpperCase()}... Effettua il login per collegare l'account.`,
      });
      await invokeTauri("start_store_login", { storeId });
    } catch (err: any) {
      setBanner({
        type: "error",
        message: `Impossibile avviare il login: ${err?.toString() || "Errore sconosciuto"}`,
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [storeId]: false }));
    }
  };

  const handleDisconnect = async (storeId: string) => {
    soundEffects.playSelect();
    setActionLoading((prev) => ({ ...prev, [storeId]: true }));
    try {
      await invokeTauri("disconnect_store_account", { storeId });
      setBanner({
        type: "info",
        message: `Account ${storeId.toUpperCase()} disconnesso con successo.`,
      });
      await loadAccounts();
      if (onSyncComplete) onSyncComplete();
    } catch (err: any) {
      setBanner({
        type: "error",
        message: `Errore nella disconnessione: ${err?.toString() || "Errore sconosciuto"}`,
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [storeId]: false }));
    }
  };

  const handleSync = async (storeId?: string) => {
    soundEffects.playSelect();
    if (storeId) {
      setActionLoading((prev) => ({ ...prev, [storeId]: true }));
      setSyncProgress((prev) => ({
        ...prev,
        [storeId]: {
          store_id: storeId,
          current: 0,
          total: 0,
          status: "syncing",
          message: "Avvio sincronizzazione cloud...",
        },
      }));
    }
    try {
      await invokeTauri("sync_store_library", storeId ? { storeId } : {});
      if (!storeId) {
        setBanner({
          type: "success",
          message: "Sincronizzazione di tutti gli account avviata con successo.",
        });
      }
    } catch (err: any) {
      if (storeId) {
        setSyncProgress((prev) => ({
          ...prev,
          [storeId]: {
            store_id: storeId,
            current: 0,
            total: 0,
            status: "error",
            message: `Errore durante la sincronizzazione: ${err?.toString() || "Errore sconosciuto"}`,
          },
        }));
      }
    } finally {
      if (storeId) {
        setActionLoading((prev) => ({ ...prev, [storeId]: false }));
      }
    }
  };

  // Quick lookup helper
  const getAccount = (id: string): StoreAccount => {
    const acc = accounts.find((a) => a.store_id.toLowerCase() === id.toLowerCase());
    return (
      acc || {
        store_id: id,
        name: id,
        is_connected: false,
        username: null,
        avatar_url: null,
        last_sync: null,
      }
    );
  };

  const gog = getAccount("gog");
  const xbox = getAccount("xbox");
  const steam = getAccount("steam");
  const epic = getAccount("epic");

  const anyCloudConnected = gog.is_connected || xbox.is_connected;

  return (
    <div className="space-y-6">
      {/* Tab Header Banner */}
      <div
        className="p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-inner shrink-0"
            style={{
              backgroundColor: "rgba(99, 102, 241, 0.15)",
              borderColor: "rgba(99, 102, 241, 0.3)",
              color: "var(--accent-primary)",
            }}
          >
            <Cloud className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              Sincronizzazione Account Cloud & OAuth
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Keyring Sicuro
              </span>
            </h4>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Collega le tue librerie digitali per importare e sincronizzare automaticamente tutti i tuoi giochi.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            type="button"
            disabled={isLoading || !anyCloudConnected}
            onClick={() => handleSync()}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
              anyCloudConnected
                ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-600/30 active:scale-95 shadow-md"
                : "opacity-40 cursor-not-allowed bg-white/5 border-white/10 text-slate-400"
            }`}
            title={anyCloudConnected ? "Sincronizza tutti gli account collegati" : "Nessun account cloud collegato"}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Sincronizza Tutti</span>
          </button>
        </div>
      </div>

      {/* Notifications / Feedback Banner */}
      {banner && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
            banner.type === "success"
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
              : banner.type === "error"
              ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
              : "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {banner.type === "error" && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {banner.type === "info" && <Info className="w-4 h-4 text-indigo-400 shrink-0" />}
            <span>{banner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="opacity-70 hover:opacity-100 font-bold ml-2 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* SECTION 1: CLOUD OAUTH STORES */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs font-black tracking-wider uppercase" style={{ color: "var(--text-muted)" }}>
          <Cloud className="w-4 h-4 text-indigo-400" />
          <span>Store Cloud Connessi via OAuth</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* CARD: GOG GALAXY */}
          <div
            className="p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between"
            style={{
              background: "linear-gradient(145deg, rgba(38, 12, 48, 0.6) 0%, rgba(20, 8, 28, 0.8) 100%)",
              borderColor: gog.is_connected ? "rgba(226, 138, 255, 0.4)" : "rgba(226, 138, 255, 0.15)",
              boxShadow: gog.is_connected ? "0 4px 20px rgba(168, 85, 247, 0.15)" : undefined,
            }}
          >
            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-purple-500/20">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-purple-900/60 border border-purple-500/40 text-purple-300 shadow-md">
                    <GogIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-white flex items-center gap-1.5">
                      GOG Galaxy
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono">
                        Cloud API
                      </span>
                    </h5>
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      CD Projekt Red DRM-Free Catalog
                    </span>
                  </div>
                </div>

                {gog.is_connected ? (
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
                {gog.is_connected ? (
                  <div className="flex items-center gap-3">
                    {gog.avatar_url ? (
                      <img
                        src={gog.avatar_url}
                        alt="Avatar"
                        className="w-10 h-10 rounded-full border border-purple-500/40 object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-purple-900/80 border border-purple-500/40 flex items-center justify-center text-purple-200 font-bold text-sm">
                        {gog.username ? gog.username.charAt(0).toUpperCase() : "G"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {gog.username || "Utente GOG"}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>Ultimo sync: {formatLastSync(gog.last_sync)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Accedi con il tuo account GOG per importare automaticamente tutta la tua libreria di giochi e i DLC posseduti.
                  </p>
                )}

                {/* Sync Progress Bar */}
                {syncProgress["gog"] && (
                  <div className="mt-2 p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/30 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 text-purple-300 font-medium">
                        {syncProgress["gog"].status === "syncing" && (
                          <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                        )}
                        {syncProgress["gog"].status === "completed" && (
                          <Check className="w-3 h-3 text-emerald-400" />
                        )}
                        {syncProgress["gog"].status === "error" && (
                          <AlertCircle className="w-3 h-3 text-rose-400" />
                        )}
                        {syncProgress["gog"].message || "Sincronizzazione in corso..."}
                      </span>
                      {syncProgress["gog"].total > 0 && (
                        <span className="font-mono text-[10px] text-purple-200">
                          {syncProgress["gog"].current} / {syncProgress["gog"].total}
                        </span>
                      )}
                    </div>
                    {syncProgress["gog"].status === "syncing" && (
                      <div className="w-full bg-purple-950 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-purple-500 to-indigo-400 h-1.5 rounded-full transition-all duration-300"
                          style={{
                            width: `${
                              syncProgress["gog"].total > 0
                                ? Math.max(8, Math.round((syncProgress["gog"].current / syncProgress["gog"].total) * 100))
                                : 25
                            }%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-purple-500/20 flex items-center justify-end gap-2">
              {gog.is_connected ? (
                <>
                  <button
                    type="button"
                    disabled={actionLoading["gog"] || syncProgress["gog"]?.status === "syncing"}
                    onClick={() => handleDisconnect("gog")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 active:scale-95 transition-all"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Disconnetti</span>
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading["gog"] || syncProgress["gog"]?.status === "syncing"}
                    onClick={() => handleSync("gog")}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-md active:scale-95 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${syncProgress["gog"]?.status === "syncing" ? "animate-spin" : ""}`} />
                    <span>Sincronizza Ora</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={actionLoading["gog"]}
                  onClick={() => handleConnect("gog")}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg active:scale-95 transition-all disabled:opacity-50"
                >
                  {actionLoading["gog"] ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <LogIn className="w-3.5 h-3.5" />
                  )}
                  <span>Connetti Account GOG</span>
                </button>
              )}
            </div>
          </div>

          {/* CARD: XBOX / PC GAME PASS */}
          <div
            className="p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between"
            style={{
              background: "linear-gradient(145deg, rgba(10, 42, 22, 0.6) 0%, rgba(6, 24, 14, 0.8) 100%)",
              borderColor: xbox.is_connected ? "rgba(50, 205, 50, 0.4)" : "rgba(50, 205, 50, 0.15)",
              boxShadow: xbox.is_connected ? "0 4px 20px rgba(34, 197, 94, 0.15)" : undefined,
            }}
          >
            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-emerald-500/20">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 shadow-md">
                    <XboxIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-white flex items-center gap-1.5">
                      Xbox / PC Game Pass
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                        OAuth 2.0
                      </span>
                    </h5>
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Microsoft Xbox Live & Game Pass Catalog
                    </span>
                  </div>
                </div>

                {xbox.is_connected ? (
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
                {xbox.is_connected ? (
                  <div className="flex items-center gap-3">
                    {xbox.avatar_url ? (
                      <img
                        src={xbox.avatar_url}
                        alt="Gamerpic"
                        className="w-10 h-10 rounded-full border border-emerald-500/40 object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-900/80 border border-emerald-500/40 flex items-center justify-center text-emerald-200 font-bold text-sm">
                        {xbox.username ? xbox.username.charAt(0).toUpperCase() : "X"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                        <span>{xbox.username || "Gamertag Xbox"}</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                          Live
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>Ultimo sync: {formatLastSync(xbox.last_sync)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Collega il tuo Microsoft Gamertag per visualizzare e sincronizzare i giochi posseduti e il catalogo PC Game Pass.
                  </p>
                )}

                {/* Sync Progress Bar */}
                {syncProgress["xbox"] && (
                  <div className="mt-2 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 text-emerald-300 font-medium">
                        {syncProgress["xbox"].status === "syncing" && (
                          <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                        )}
                        {syncProgress["xbox"].status === "completed" && (
                          <Check className="w-3 h-3 text-emerald-400" />
                        )}
                        {syncProgress["xbox"].status === "error" && (
                          <AlertCircle className="w-3 h-3 text-rose-400" />
                        )}
                        {syncProgress["xbox"].message || "Sincronizzazione in corso..."}
                      </span>
                      {syncProgress["xbox"].total > 0 && (
                        <span className="font-mono text-[10px] text-emerald-200">
                          {syncProgress["xbox"].current} / {syncProgress["xbox"].total}
                        </span>
                      )}
                    </div>
                    {syncProgress["xbox"].status === "syncing" && (
                      <div className="w-full bg-emerald-950 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-emerald-500 to-teal-400 h-1.5 rounded-full transition-all duration-300"
                          style={{
                            width: `${
                              syncProgress["xbox"].total > 0
                                ? Math.max(8, Math.round((syncProgress["xbox"].current / syncProgress["xbox"].total) * 100))
                                : 25
                            }%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-emerald-500/20 flex items-center justify-end gap-2">
              {xbox.is_connected ? (
                <>
                  <button
                    type="button"
                    disabled={actionLoading["xbox"] || syncProgress["xbox"]?.status === "syncing"}
                    onClick={() => handleDisconnect("xbox")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 active:scale-95 transition-all"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Disconnetti</span>
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading["xbox"] || syncProgress["xbox"]?.status === "syncing"}
                    onClick={() => handleSync("xbox")}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md active:scale-95 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${syncProgress["xbox"]?.status === "syncing" ? "animate-spin" : ""}`} />
                    <span>Sincronizza Ora</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={actionLoading["xbox"]}
                  onClick={() => handleConnect("xbox")}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-lg active:scale-95 transition-all disabled:opacity-50"
                >
                  {actionLoading["xbox"] ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <LogIn className="w-3.5 h-3.5" />
                  )}
                  <span>Connetti Xbox Live</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: LOCAL DISK STORE SCANNERS */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs font-black tracking-wider uppercase" style={{ color: "var(--text-muted)" }}>
          <HardDrive className="w-4 h-4 text-sky-400" />
          <span>Integrazione Store Locali Rilevati su Disco</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* STEAM CARD */}
          <div
            className="p-4 rounded-2xl border flex items-center justify-between gap-3"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "rgba(102, 192, 244, 0.25)",
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border"
                style={{
                  background: "linear-gradient(135deg, rgba(23, 53, 77, 0.8) 0%, rgba(16, 33, 48, 0.9) 100%)",
                  borderColor: "rgba(102, 192, 244, 0.4)",
                  color: "#66c0f4",
                }}
              >
                <SteamIcon className="w-5 h-5 text-[#66c0f4]" />
              </div>
              <div className="min-w-0">
                <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                  Steam
                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-sky-500/20 text-sky-300 font-mono">
                    VDF Manifest
                  </span>
                </h5>
                <p className="text-[11px] truncate text-slate-400">
                  Rilevato su disco locale (VDF manifest)
                </p>
              </div>
            </div>
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
              <Check className="w-3 h-3 text-sky-400" />
              Attivo
            </span>
          </div>

          {/* EPIC GAMES CARD */}
          <div
            className="p-4 rounded-2xl border flex items-center justify-between gap-3"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "rgba(255, 255, 255, 0.15)",
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border"
                style={{
                  background: "linear-gradient(135deg, rgba(43, 43, 43, 0.8) 0%, rgba(24, 24, 24, 0.9) 100%)",
                  borderColor: "rgba(255, 255, 255, 0.3)",
                  color: "#ffffff",
                }}
              >
                <EpicIcon className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                  Epic Games Store
                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-slate-500/20 text-slate-300 font-mono">
                    .item Manifest
                  </span>
                </h5>
                <p className="text-[11px] truncate text-slate-400">
                  Rilevato su disco locale (Manifest .item)
                </p>
              </div>
            </div>
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30">
              <Check className="w-3 h-3 text-slate-300" />
              Attivo
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 3: STORE IN ARRIVO (FUTURE STORES) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-black tracking-wider uppercase" style={{ color: "var(--text-muted)" }}>
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Store in Arrivo (Future Stores)</span>
          </div>
          <span className="text-[10px] text-amber-400/80 font-mono">
            Roadmap 2026
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {FUTURE_STORES.map((fs) => (
            <div
              key={fs.id}
              className="p-3 rounded-2xl border flex items-center justify-between gap-2.5 opacity-75 hover:opacity-100 transition-all"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border text-xs font-black"
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    borderColor: "var(--border-color)",
                    color: fs.color,
                  }}
                >
                  <Gamepad2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">{fs.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">{fs.publisher}</div>
                </div>
              </div>
              <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Prossimamente
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StoreAccountsTab;
