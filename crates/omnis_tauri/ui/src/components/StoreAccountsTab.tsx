import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Cloud,
  Sparkles,
  Info,
  Trash2,
  ShieldCheck,
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
  onClose?: () => void;
}

interface VaultStatus {
  is_fallback: boolean;
  warning?: string | null;
}

export const StoreAccountsTab: React.FC<StoreAccountsTabProps> = ({
  onSyncComplete,
  onClose,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"connected" | "sync" | "future">("connected");
  const [accounts, setAccounts] = useState<StoreAccount[]>(DEFAULT_ACCOUNTS);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [syncProgress, setSyncProgress] = useState<Record<string, StoreSyncProgress>>({});
  const [banner, setBanner] = useState<{ type: "success" | "info" | "error"; message: string } | null>(null);

  const checkVaultStatus = async () => {
    try {
      const res = await invokeTauri<VaultStatus>("get_vault_status");
      if (res) {
        setVaultStatus(res);
      }
    } catch (e) {
      console.debug("Failed getting vault status:", e);
    }
  };

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
    checkVaultStatus();

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
            setBanner({
              type: "success",
              message: payload.message || `Sincronizzazione completata con successo per ${payload.store_id.toUpperCase()}!`,
            });
            loadAccounts();
            if (onSyncComplete) onSyncComplete();
          } else if (payload.status === "error") {
            setBanner({
              type: "error",
              message: payload.message || `Errore nella sincronizzazione di ${payload.store_id.toUpperCase()}`,
            });
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

  const handleSaveApiKey = async (storeId: string, apiKey: string) => {
    soundEffects.playSelect();
    try {
      await invokeTauri("save_store_api_key", { storeId, apiKey });
      setBanner({
        type: "success",
        message: `Chiave Web API per ${storeId.toUpperCase()} salvata con successo! Avvio sincronizzazione...`,
      });
      await loadAccounts();
      handleSync(storeId);
    } catch (err: any) {
      setBanner({
        type: "error",
        message: `Errore salvataggio API Key: ${err?.toString() || "Errore sconosciuto"}`,
      });
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
          type: "info",
          message: "Sincronizzazione di tutti gli account avviata in background.",
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
    <div className="flex-1 flex flex-col min-h-0 select-none">
      {/* Sub-tab Navigation matching settings_01.jpg layout */}
      <div
        className="flex items-center gap-1 border-b px-6 py-2.5 bg-black/20 shrink-0 overflow-x-auto"
        style={{ borderColor: "var(--border-color)" }}
      >
        <button
          type="button"
          onClick={() => {
            soundEffects.playNav();
            setActiveSubTab("connected");
          }}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative flex items-center gap-2 ${
            activeSubTab === "connected"
              ? "text-sky-400 bg-sky-500/10 shadow-xs"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Cloud className="w-3.5 h-3.5" />
          <span>Store Connessi</span>
          {activeSubTab === "connected" && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-400 rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            soundEffects.playNav();
            setActiveSubTab("sync");
          }}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative flex items-center gap-2 ${
            activeSubTab === "sync"
              ? "text-sky-400 bg-sky-500/10 shadow-xs"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Sincronizzazione &amp; Vault</span>
          {activeSubTab === "sync" && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-400 rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            soundEffects.playNav();
            setActiveSubTab("future");
          }}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative flex items-center gap-2 ${
            activeSubTab === "future"
              ? "text-sky-400 bg-sky-500/10 shadow-xs"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Store in Arrivo</span>
          {activeSubTab === "future" && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-400 rounded-full" />
          )}
        </button>
      </div>

      {/* Main SubTab Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* Notifications / Feedback Banner (visible if set) */}
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

        {/* SUBTAB 1: STORE CONNESSI */}
        {activeSubTab === "connected" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black tracking-wider uppercase text-slate-300">
                <Cloud className="w-4 h-4 text-indigo-400" />
                <span>Store Cloud Connessi via OAuth &amp; Web API</span>
              </div>
              <span className="text-[11px] text-slate-400">
                {accounts.filter((a) => a.is_connected).length} di {accounts.length} connessi
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Collega le tue librerie digitali per importare e sincronizzare automaticamente tutti i tuoi giochi, tempo di gioco e obiettivi.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
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
                onSaveApiKey={handleSaveApiKey}
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
        )}

        {/* SUBTAB 2: SINCRONIZZAZIONE & VAULT */}
        {activeSubTab === "sync" && (
          <div className="space-y-5">
            {/* Sync Header Banner */}
            <div
              className="p-4 sm:p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-inner shrink-0"
                  style={{
                    backgroundColor: "rgba(99, 102, 241, 0.15)",
                    borderColor: "rgba(99, 102, 241, 0.3)",
                    color: "var(--accent-primary)",
                  }}
                >
                  <RefreshCw className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h4 className="text-sm font-black text-white whitespace-nowrap">
                      Sincronizzazione Manuale e Ripristino
                    </h4>
                    {vaultStatus?.is_fallback ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap shrink-0">
                        <AlertCircle className="w-3 h-3 text-amber-400" />
                        <span>File Protetto (Fallback 0600)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 whitespace-nowrap shrink-0">
                        <ShieldCheck className="w-3 h-3 text-indigo-400" />
                        <span>Keyring Sicuro</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1 leading-relaxed text-slate-400">
                    Avvia una scansione completa di tutte le piattaforme connesse per scaricare nuovi titoli, tempi di gioco e trofei.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start md:self-center shrink-0">
                <button
                  type="button"
                  disabled={isLoading || !anyCloudConnected}
                  onClick={() => handleSync()}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                    anyCloudConnected
                      ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-600/30 active:scale-95 shadow-md cursor-pointer"
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
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-rose-500/30 text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 transition-all shadow-sm whitespace-nowrap cursor-pointer"
                  title="Svuota tutti i giochi dal database locale (rimuove eventuali dati mock o duplicati)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Svuota Libreria</span>
                </button>
              </div>
            </div>

            {/* Keyring Security Info Card */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Archiviazione Sicura Credenziali (Vault &amp; Keyring)</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {vaultStatus?.is_fallback ? (
                  <span className="text-amber-300">
                    {vaultStatus.warning ||
                      "Archiviazione sicura di sistema (Keyring) non disponibile. Chiave master salvata in file protetto locale (chmod 0600)."}
                  </span>
                ) : (
                  <span>
                    Tutti i token OAuth (Steam, Epic, GOG, Xbox Live) sono memorizzati in modo crittografato tramite l'archivio credenziali di sistema nativo (Windows Credential Manager / Linux Secret Service / macOS Keychain) protetti da crittografia simmetrica AES-256-GCM.
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* SUBTAB 3: STORE IN ARRIVO (FUTURE STORES) */}
        {activeSubTab === "future" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black tracking-wider uppercase text-slate-300">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Store &amp; Piattaforme in Roadmap</span>
              </div>
              <span className="text-[10px] text-amber-400/80 font-mono px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/20">
                Roadmap 2026
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              I seguenti connettori verranno rilasciati nei prossimi aggiornamenti del sistema di plugin modulare di Omnis:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
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
        )}
      </div>

      {/* Footer Actions exactly matching settings_01.jpg layout */}
      <div
        className="flex items-center justify-between px-6 py-4 border-t bg-black/40 shrink-0"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex items-center gap-2">
          {vaultStatus?.is_fallback ? (
            <span className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Vault: File Protetto (0600)</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-indigo-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Vault: Keyring Sicuro Attivo</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isLoading || !anyCloudConnected}
            onClick={() => handleSync()}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
              anyCloudConnected
                ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-600/30 cursor-pointer"
                : "opacity-40 cursor-not-allowed bg-white/5 border-white/10 text-slate-400"
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Sincronizza Tutti</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-bold border hover:bg-white/10 transition-colors cursor-pointer"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              Chiudi
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StoreAccountsTab;
