import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Cloud,
  Sparkles,
  Info,
  Trash2,
} from "lucide-react";
import { SteamIcon, EpicIcon, GogIcon, XboxIcon } from "./StoreBadge";
import soundEffects from "../utils/soundEffects";
import {
  StoreAccount,
  StoreSyncProgress,
  DEFAULT_ACCOUNTS,
  FUTURE_STORES,
  invokeTauri,
  listenTauri,
} from "./store_accounts/types";
import { CloudStoreCard } from "./store_accounts/CloudStoreCard";
import { FutureStoreCard } from "./store_accounts/FutureStoreCard";

export type { StoreAccount, StoreSyncProgress };

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
  const anyCloudConnected = gog.is_connected || xbox.is_connected || steam.is_connected || epic.is_connected;

  const handleClearLibrary = async () => {
    soundEffects.playSelect();
    try {
      await invokeTauri("clear_library");
      setBanner({
        type: "info",
        message: "Libreria svuotata con successo. I giochi mock sono stati rimossi dal database.",
      });
      if (onSyncComplete) onSyncComplete();
    } catch (err: any) {
      setBanner({
        type: "error",
        message: `Errore durante la pulizia della libreria: ${err?.toString() || "Errore sconosciuto"}`,
      });
    }
  };

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

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
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
          <button
            type="button"
            onClick={handleClearLibrary}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-rose-500/30 text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 transition-all shadow-sm"
            title="Svuota tutti i giochi dal database locale (rimuove eventuali dati mock o duplicati)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Svuota Libreria</span>
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
          <CloudStoreCard
            account={steam}
            subtitle="Libreria Steam & Comunità"
            icon={<SteamIcon className="w-5 h-5 text-[#66c0f4]" />}
            bgGradient="linear-gradient(145deg, rgba(16, 36, 56, 0.6) 0%, rgba(10, 22, 35, 0.8) 100%)"
            borderColor="rgba(102, 192, 244, 0.4)"
            accentColor="#66c0f4"
            badgeBg="bg-sky-500/20"
            badgeText="text-sky-300"
            actionLoading={!!actionLoading["steam"]}
            syncProgress={syncProgress["steam"]}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onSync={handleSync}
          />

          <CloudStoreCard
            account={epic}
            subtitle="Libreria Epic Games Launcher"
            icon={<EpicIcon className="w-5 h-5 text-white" />}
            bgGradient="linear-gradient(145deg, rgba(35, 35, 35, 0.6) 0%, rgba(18, 18, 18, 0.8) 100%)"
            borderColor="rgba(255, 255, 255, 0.35)"
            accentColor="#ffffff"
            badgeBg="bg-slate-500/20"
            badgeText="text-slate-200"
            actionLoading={!!actionLoading["epic"]}
            syncProgress={syncProgress["epic"]}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onSync={handleSync}
          />

          <CloudStoreCard
            account={gog}
            subtitle="Catalogo GOG DRM-Free"
            icon={<GogIcon className="w-5 h-5" />}
            bgGradient="linear-gradient(145deg, rgba(38, 12, 48, 0.6) 0%, rgba(20, 8, 28, 0.8) 100%)"
            borderColor="rgba(226, 138, 255, 0.4)"
            accentColor="#a855f7"
            badgeBg="bg-purple-500/20"
            badgeText="text-purple-300"
            actionLoading={!!actionLoading["gog"]}
            syncProgress={syncProgress["gog"]}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onSync={handleSync}
          />

          <CloudStoreCard
            account={xbox}
            subtitle="Catalogo Microsoft & Game Pass"
            icon={<XboxIcon className="w-5 h-5 text-[#107c10]" />}
            bgGradient="linear-gradient(145deg, rgba(12, 38, 18, 0.6) 0%, rgba(8, 24, 12, 0.8) 100%)"
            borderColor="rgba(16, 124, 16, 0.4)"
            accentColor="#107c10"
            badgeBg="bg-emerald-500/20"
            badgeText="text-emerald-300"
            actionLoading={!!actionLoading["xbox"]}
            syncProgress={syncProgress["xbox"]}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onSync={handleSync}
          />
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
            <FutureStoreCard
              key={fs.id}
              name={fs.name}
              publisher={fs.publisher}
              color={fs.color}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default StoreAccountsTab;
