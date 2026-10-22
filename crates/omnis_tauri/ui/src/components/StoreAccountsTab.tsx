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
  Check,
  ExternalLink,
  HelpCircle,
  FolderOpen,
  Lock,
  Key,
  Layers,
  ChevronRight,
  LogOut,
  LogIn,
} from "lucide-react";
import { SteamIcon, EpicIcon, GogIcon, XboxIcon } from "./StoreBadge";
import soundEffects from "../utils/soundEffects";
import { openExternalUrl } from "../utils/openUrl";
import {
  StoreAccount,
  StoreSyncProgress,
  StoreIntegrationSettings,
  DEFAULT_ACCOUNTS,
  invokeTauri,
  listenTauri,
  formatLastSync,
} from "./store_accounts/types";

export type { StoreAccount, StoreSyncProgress, StoreIntegrationSettings };

interface StoreAccountsTabProps {
  onSyncComplete?: () => void;
  onClose?: () => void;
}

interface VaultStatus {
  is_fallback: boolean;
  warning?: string | null;
}

interface StoreItemMeta {
  id: string;
  name: string;
  icon: (className?: string) => React.ReactNode;
  tag?: string;
  isCustom?: boolean;
}

const STORE_LIST: StoreItemMeta[] = [
  {
    id: "amazon",
    name: "Amazon Games",
    icon: (c = "w-4 h-4") => <Layers className={`${c} text-amber-400`} />,
    tag: "Locale",
  },
  {
    id: "epic",
    name: "Epic Games",
    icon: (c = "w-4 h-4") => <EpicIcon className={c} />,
    tag: "OAuth",
  },
  {
    id: "gog",
    name: "GOG Galaxy",
    icon: (c = "w-4 h-4") => <GogIcon className={c} />,
    tag: "OAuth",
  },
  {
    id: "multimc",
    name: "MultiMC / Prism",
    icon: (c = "w-4 h-4") => <Layers className={`${c} text-emerald-400`} />,
    tag: "Locale",
    isCustom: true,
  },
  {
    id: "steam",
    name: "Steam",
    icon: (c = "w-4 h-4") => <SteamIcon className={`${c} text-[#66c0f4]`} />,
    tag: "API Key",
  },
  {
    id: "xbox",
    name: "Xbox / PC Game Pass",
    icon: (c = "w-4 h-4") => <XboxIcon className={`${c} text-[#107c10]`} />,
    tag: "OAuth",
  },
];

export const StoreAccountsTab: React.FC<StoreAccountsTabProps> = ({
  onSyncComplete,
  onClose,
}) => {
  const [selectedStoreId, setSelectedStoreId] = useState<string>("steam");
  const [activeTab, setActiveTab] = useState<"general" | "accounts" | "advanced">("general");
  const [accounts, setAccounts] = useState<StoreAccount[]>(DEFAULT_ACCOUNTS);
  const [settingsMap, setSettingsMap] = useState<Record<string, StoreIntegrationSettings>>({});
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [syncProgress, setSyncProgress] = useState<Record<string, StoreSyncProgress>>({});
  const [banner, setBanner] = useState<{ type: "success" | "info" | "error"; message: string } | null>(null);
  const [showTroubleshoot, setShowTroubleshoot] = useState<boolean>(false);

  // Helper to load settings for a store
  const loadSettingsForStore = async (storeId: string) => {
    try {
      const res = await invokeTauri<StoreIntegrationSettings>("get_store_integration_settings", { storeId });
      if (res) {
        setSettingsMap((prev) => ({ ...prev, [storeId]: res }));
      } else {
        setSettingsMap((prev) => ({
          ...prev,
          [storeId]: {
            store_id: storeId,
            import_installed: true,
            connect_account: false,
            import_uninstalled: true,
            ignore_other_accounts: true,
            account_id: "",
            api_key: "",
            import_free_items: false,
            import_family_sharing: true,
            import_game_pass: true,
            custom_client_path: "",
          },
        }));
      }
    } catch (e) {
      console.warn(`Failed loading settings for ${storeId}:`, e);
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

  const checkVaultStatus = async () => {
    try {
      const res = await invokeTauri<VaultStatus>("get_vault_status");
      if (res) setVaultStatus(res);
    } catch (e) {
      console.debug("Failed getting vault status:", e);
    }
  };

  useEffect(() => {
    loadAccounts();
    checkVaultStatus();
    for (const store of STORE_LIST) {
      loadSettingsForStore(store.id);
    }

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
          loadSettingsForStore(payload.store_id);
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
          loadAccounts();
          loadSettingsForStore(payload.store_id);
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
              message: payload.message || `Sincronizzazione completata per ${payload.store_id.toUpperCase()}!`,
            });
            loadAccounts();
            if (onSyncComplete) onSyncComplete();
          } else if (payload.status === "error") {
            setBanner({
              type: "error",
              message: payload.message || `Errore sincronizzazione per ${payload.store_id.toUpperCase()}`,
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

  const currentSettings: StoreIntegrationSettings = settingsMap[selectedStoreId] || {
    store_id: selectedStoreId,
    import_installed: true,
    connect_account: false,
    import_uninstalled: true,
    ignore_other_accounts: true,
    account_id: "",
    api_key: "",
    import_free_items: false,
    import_family_sharing: true,
    import_game_pass: true,
    custom_client_path: "",
  };

  const currentAccount = accounts.find((a) => a.store_id === selectedStoreId) || {
    store_id: selectedStoreId,
    name: selectedStoreId,
    is_connected: false,
    username: null,
    avatar_url: null,
    last_sync: null,
  };

  const updateSetting = <K extends keyof StoreIntegrationSettings>(
    key: K,
    val: StoreIntegrationSettings[K]
  ) => {
    setSettingsMap((prev) => ({
      ...prev,
      [selectedStoreId]: {
        ...currentSettings,
        [key]: val,
      },
    }));
  };

  const handleSave = async () => {
    soundEffects.playSelect();
    setIsSaving(true);
    setBanner(null);

    // Strict validation for Steam
    if (selectedStoreId === "steam" && currentSettings.connect_account) {
      const key = (currentSettings.api_key || "").trim();
      const id = (currentSettings.account_id || "").trim();

      if (!id) {
        setBanner({
          type: "error",
          message: "L'ID account (SteamID64 di 17 cifre) è obbligatorio per connettere Steam.",
        });
        setIsSaving(false);
        return;
      }

      if (!key) {
        setBanner({
          type: "error",
          message: "La Chiave API di Steam è obbligatoria per sincronizzare giochi e progressi.",
        });
        setIsSaving(false);
        return;
      }
    }

    try {
      await invokeTauri("save_store_integration_settings", { settings: currentSettings });
      setBanner({
        type: "success",
        message: `Configurazione di ${STORE_LIST.find((s) => s.id === selectedStoreId)?.name || selectedStoreId} salvata con successo nel Vault!`,
      });
      await loadAccounts();
      await loadSettingsForStore(selectedStoreId);
      if (onSyncComplete) onSyncComplete();
    } catch (err: any) {
      setBanner({
        type: "error",
        message: `Errore durante il salvataggio: ${err?.toString() || "Errore sconosciuto"}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncCurrent = async () => {
    soundEffects.playSelect();
    setActionLoading((prev) => ({ ...prev, [selectedStoreId]: true }));
    setSyncProgress((prev) => ({
      ...prev,
      [selectedStoreId]: {
        store_id: selectedStoreId,
        current: 0,
        total: 0,
        status: "syncing",
        message: `Sincronizzazione ${selectedStoreId.toUpperCase()} in corso...`,
      },
    }));

    try {
      await invokeTauri("sync_store_library", { storeId: selectedStoreId });
      setBanner({
        type: "info",
        message: `Sincronizzazione per ${selectedStoreId.toUpperCase()} avviata in background.`,
      });
    } catch (err: any) {
      setBanner({
        type: "error",
        message: `Errore sincronizzazione: ${err?.toString() || "Errore sconosciuto"}`,
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [selectedStoreId]: false }));
    }
  };

  const handleConnectOAuth = async () => {
    soundEffects.playSelect();
    setActionLoading((prev) => ({ ...prev, [selectedStoreId]: true }));
    try {
      setBanner({
        type: "info",
        message: `Apertura login per ${selectedStoreId.toUpperCase()}...`,
      });
      await invokeTauri("start_store_login", { storeId: selectedStoreId });
    } catch (err: any) {
      setBanner({
        type: "error",
        message: `Impossibile avviare il login: ${err?.toString() || "Errore sconosciuto"}`,
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [selectedStoreId]: false }));
    }
  };

  const handleDisconnectStore = async () => {
    soundEffects.playSelect();
    setActionLoading((prev) => ({ ...prev, [selectedStoreId]: true }));
    try {
      await invokeTauri("disconnect_store_account", { storeId: selectedStoreId });
      updateSetting("connect_account", false);
      setBanner({
        type: "info",
        message: `Account ${selectedStoreId.toUpperCase()} disconnesso.`,
      });
      await loadAccounts();
      await loadSettingsForStore(selectedStoreId);
      if (onSyncComplete) onSyncComplete();
    } catch (err: any) {
      setBanner({
        type: "error",
        message: `Errore nella disconnessione: ${err?.toString() || "Errore sconosciuto"}`,
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [selectedStoreId]: false }));
    }
  };

  const activeProgress = syncProgress[selectedStoreId];
  const isCurrentlySyncing = activeProgress?.status === "syncing" || actionLoading[selectedStoreId];

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none text-slate-200">
      {/* Top Banner Notifications */}
      {banner && (
        <div
          className={`mx-6 mt-4 p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
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
            className="opacity-70 hover:opacity-100 font-bold ml-2 text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main 2-Column Container matching Playnite Screenshot */}
      <div className="flex-1 flex min-h-0 overflow-hidden p-6 gap-6">
        {/* LEFT COLUMN: Sidebar List of Integrations */}
        <div
          className="w-56 shrink-0 rounded-2xl border flex flex-col overflow-hidden bg-black/20"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div
            className="p-3 border-b text-xs font-black uppercase tracking-wider text-slate-400 flex items-center justify-between"
            style={{ borderColor: "var(--border-color)" }}
          >
            <span>Integrazioni Store</span>
            <span className="text-[10px] text-slate-400 font-mono">
              {accounts.filter((a) => a.is_connected).length}/{STORE_LIST.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {STORE_LIST.map((store) => {
              const acc = accounts.find((a) => a.store_id === store.id);
              const isSelected = selectedStoreId === store.id;
              const isConn = acc?.is_connected;

              return (
                <button
                  key={store.id}
                  type="button"
                  onClick={() => {
                    soundEffects.playNav();
                    setSelectedStoreId(store.id);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? "bg-sky-500/20 text-white border border-sky-400/40 shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {store.icon("w-4 h-4 shrink-0")}
                    <span className="truncate">{store.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isConn ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
                      }`}
                      title={isConn ? "Autenticato / Connesso" : "Non connesso"}
                    />
                    <ChevronRight className={`w-3.5 h-3.5 opacity-50 ${isSelected ? "text-sky-400" : ""}`} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Vault Security Footer in sidebar */}
          <div className="p-3 border-t text-[11px] text-slate-400 bg-black/40 flex items-center gap-2" style={{ borderColor: "var(--border-color)" }}>
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">Vault cifrato (AES-256)</span>
          </div>
        </div>

        {/* RIGHT COLUMN: Configuration Tabs & Content for Selected Store */}
        <div
          className="flex-1 rounded-2xl border flex flex-col min-h-0 overflow-hidden bg-black/20"
          style={{ borderColor: "var(--border-color)" }}
        >
          {/* Top Sub-tabs matching Playnite Screenshot (Generale, Account aggiuntivi, Avanzate) */}
          <div
            className="flex items-center gap-1 border-b px-6 py-2.5 bg-black/20 shrink-0"
            style={{ borderColor: "var(--border-color)" }}
          >
            <button
              type="button"
              onClick={() => {
                soundEffects.playNav();
                setActiveTab("general");
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative cursor-pointer ${
                activeTab === "general"
                  ? "text-sky-400 bg-sky-500/10 shadow-xs"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span>Generale</span>
              {activeTab === "general" && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-400 rounded-full" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                soundEffects.playNav();
                setActiveTab("accounts");
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative cursor-pointer ${
                activeTab === "accounts"
                  ? "text-sky-400 bg-sky-500/10 shadow-xs"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span>Account aggiuntivi</span>
              {activeTab === "accounts" && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-400 rounded-full" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                soundEffects.playNav();
                setActiveTab("advanced");
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative cursor-pointer ${
                activeTab === "advanced"
                  ? "text-sky-400 bg-sky-500/10 shadow-xs"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span>Avanzate</span>
              {activeTab === "advanced" && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-400 rounded-full" />
              )}
            </button>
          </div>

          {/* TAB 1: GENERALE */}
          {activeTab === "general" && (
            <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
              {/* Option 1: Importa i giochi installati */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={currentSettings.import_installed}
                  onChange={(e) => updateSetting("import_installed", e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400 cursor-pointer"
                />
                <span className="text-sm font-semibold text-white">
                  Importa i giochi installati
                </span>
              </label>

              {/* Option 2: Connetti l'account */}
              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={currentSettings.connect_account}
                      onChange={(e) => updateSetting("connect_account", e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400 cursor-pointer"
                    />
                    <span className="text-sm font-semibold text-white">
                      Connetti l'account
                    </span>
                  </label>

                  {/* Auth status pill */}
                  <div>
                    {currentAccount.is_connected ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>L'utente è autenticato</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-white/10">
                        <span>Non autenticato</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Sub-options indented under "Connetti l'account" */}
                {currentSettings.connect_account && (
                  <div className="ml-7 pl-4 border-l border-white/10 space-y-4 animate-in fade-in">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={currentSettings.import_uninstalled}
                        onChange={(e) => updateSetting("import_uninstalled", e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400 cursor-pointer"
                      />
                      <span className="text-xs text-slate-200 font-medium">
                        Importa giochi non installati (libreria cloud)
                      </span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={currentSettings.ignore_other_accounts}
                        onChange={(e) => updateSetting("ignore_other_accounts", e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400 cursor-pointer"
                      />
                      <span className="text-xs text-slate-200 font-medium">
                        Ignora giochi installati da altri account
                      </span>
                    </label>

                    {/* STEAM SPECIFIC: API KEY LOGIN (MANDATORY AS SPECIFIED) */}
                    {selectedStoreId === "steam" && (
                      <div className="p-4 rounded-xl bg-black/40 border border-sky-500/30 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              id="api_login"
                              name="steam_auth_type"
                              checked={true}
                              readOnly
                              className="text-sky-500"
                            />
                            <label htmlFor="api_login" className="text-xs font-bold text-sky-300">
                              API key login (Obbligatoria)
                            </label>
                          </div>
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                            Richiesta per Obiettivi
                          </span>
                        </div>

                        {/* ID Account Field */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <label className="font-semibold text-slate-300">
                              ID account (SteamID64):
                            </label>
                            <a
                              href="https://steamcommunity.com/my"
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => {
                                e.preventDefault();
                                openExternalUrl("https://steamcommunity.com/my");
                              }}
                              className="text-sky-400 hover:text-sky-300 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>Ottieni ID account</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <input
                            type="text"
                            value={currentSettings.account_id || ""}
                            onChange={(e) => updateSetting("account_id", e.target.value.trim())}
                            placeholder="Es. 76561198016913702"
                            className="w-full bg-slate-900/90 border border-white/20 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 shadow-inner"
                          />
                        </div>

                        {/* Chiave API Field */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <label className="font-semibold text-slate-300">
                              Chiave API:
                            </label>
                            <a
                              href="https://steamcommunity.com/dev/apikey"
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => {
                                e.preventDefault();
                                openExternalUrl("https://steamcommunity.com/dev/apikey");
                              }}
                              className="text-sky-400 hover:text-sky-300 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>Ottieni la chiave API</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <input
                            type="password"
                            value={currentSettings.api_key || ""}
                            onChange={(e) => updateSetting("api_key", e.target.value.trim())}
                            placeholder="Chiave alfanumerica di 32 caratteri"
                            className="w-full bg-slate-900/90 border border-white/20 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 shadow-inner"
                          />
                        </div>

                        {/* Extra Steam Options */}
                        <div className="pt-2 border-t border-white/10 space-y-2.5">
                          <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={currentSettings.import_free_items || false}
                              onChange={(e) => updateSetting("import_free_items", e.target.checked)}
                              className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400 cursor-pointer"
                            />
                            <span className="text-xs text-slate-300 font-medium">
                              Importa generici articoli gratuiti
                            </span>
                          </label>

                          <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={currentSettings.import_family_sharing ?? true}
                              onChange={(e) => updateSetting("import_family_sharing", e.target.checked)}
                              className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400 cursor-pointer"
                            />
                            <span className="text-xs text-slate-300 font-medium">
                              Importa giochi condivisi in famiglia
                            </span>
                          </label>
                        </div>
                      </div>
                    )}

                    {/* OAUTH STORES: EPIC, GOG, XBOX */}
                    {selectedStoreId !== "steam" && (
                      <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-300">
                            Autenticazione Cloud Ufficiale:
                          </span>
                          {currentAccount.last_sync && (
                            <span className="text-[11px] text-slate-400">
                              Ultimo sync: {formatLastSync(currentAccount.last_sync)}
                            </span>
                          )}
                        </div>

                        {currentAccount.is_connected ? (
                          <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                            <div className="flex items-center gap-3">
                              {currentAccount.avatar_url ? (
                                <img
                                  src={currentAccount.avatar_url}
                                  alt="Avatar"
                                  className="w-8 h-8 rounded-full border border-emerald-400/40 object-cover"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center font-bold text-xs text-emerald-300">
                                  {currentAccount.username?.charAt(0).toUpperCase() || "U"}
                                </div>
                              )}
                              <div>
                                <p className="text-xs font-bold text-white">
                                  {currentAccount.username || "Utente Connesso"}
                                </p>
                                <p className="text-[11px] text-emerald-300">Sessione attiva nel Vault</p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={handleDisconnectStore}
                              className="px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/15 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              <span>Disconnetti</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/10">
                            <p className="text-xs text-slate-400">
                              Accedi tramite finestra sicura per sincronizzare libreria, salvataggi e trofei.
                            </p>
                            <button
                              type="button"
                              onClick={handleConnectOAuth}
                              disabled={actionLoading[selectedStoreId]}
                              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                            >
                              <LogIn className="w-3.5 h-3.5" />
                              <span>Connetti</span>
                            </button>
                          </div>
                        )}

                        {selectedStoreId === "xbox" && (
                          <label className="flex items-center gap-3 cursor-pointer select-none pt-1">
                            <input
                              type="checkbox"
                              checked={currentSettings.import_game_pass ?? true}
                              onChange={(e) => updateSetting("import_game_pass", e.target.checked)}
                              className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400 cursor-pointer"
                            />
                            <span className="text-xs text-slate-300 font-medium">
                              Includi catalogo giochi PC Game Pass
                            </span>
                          </label>
                        )}
                      </div>
                    )}

                    {/* Troubleshoot link */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowTroubleshoot(true)}
                        className="text-xs text-sky-400 hover:text-sky-300 font-semibold underline underline-offset-2 flex items-center gap-1 cursor-pointer"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>Risoluzione dei problemi</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ACCOUNT AGGIUNTIVI */}
          {activeTab === "accounts" && (
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white uppercase tracking-wider">
                  Profili &amp; Account Secondari
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                È possibile gestire account secondari o profili familiari per sincronizzare librerie multiple contemporaneamente.
              </p>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white">
                      {currentAccount.username || "Account Principale"}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {currentAccount.is_connected ? "Attivo e sincronizzato" : "Non connesso"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: AVANZATE */}
          {activeTab === "advanced" && (
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  Percorso personalizzato client / installazione:
                </label>
                <input
                  type="text"
                  value={currentSettings.custom_client_path || ""}
                  onChange={(e) => updateSetting("custom_client_path", e.target.value)}
                  placeholder="Es. C:\Program Files (x86)\Steam o percorso personalizzato"
                  className="w-full bg-slate-900 border border-white/20 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                />
                <p className="text-[11px] text-slate-400">
                  Lascia vuoto per utilizzare la ricerca automatica dal Registro di sistema.
                </p>
              </div>
            </div>
          )}

          {/* FOOTER matching Screenshot */}
          <div
            className="flex items-center justify-between px-6 py-4 border-t bg-black/40 shrink-0"
            style={{ borderColor: "var(--border-color)" }}
          >
            <span className="text-[11px] text-slate-400 italic">
              * Richiede il salvataggio per applicare le credenziali nel Vault sicuro
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSyncCurrent}
                disabled={isCurrentlySyncing || !currentAccount.is_connected}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-white/20 bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCurrentlySyncing ? "animate-spin text-sky-400" : ""}`} />
                <span>{isCurrentlySyncing ? "Sincronizzazione..." : "Sincronizza Ora"}</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 rounded-xl text-xs font-bold text-white shadow-md hover:brightness-110 active:opacity-90 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: "var(--accent-primary)" }}
              >
                {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Salva</span>
              </button>

              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/10 hover:bg-white/10 transition-colors text-slate-300 cursor-pointer"
                >
                  Cancella
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Troubleshooting Dialog Modal */}
      {showTroubleshoot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div
            className="w-full max-w-lg rounded-2xl border p-6 space-y-4 shadow-2xl"
            style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-color)" }}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <HelpCircle className="w-4 h-4 text-sky-400" />
                <span>Risoluzione dei Problemi: Integrazione Steam</span>
              </div>
              <button
                type="button"
                onClick={() => setShowTroubleshoot(false)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
              <p>
                <strong>1. Come ottenere lo SteamID64:</strong>
                <br />
                Accedi al tuo profilo Steam da browser. L'URL avrà il formato{" "}
                <code className="text-sky-300 bg-black/40 px-1 py-0.5 rounded">
                  steamcommunity.com/profiles/76561198...
                </code>
                . Il numero a 17 cifre è il tuo SteamID64.
              </p>
              <p>
                <strong>2. Come ottenere la Steam Web API Key gratuita:</strong>
                <br />
                Visita{" "}
                <a
                  href="https://steamcommunity.com/dev/apikey"
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    openExternalUrl("https://steamcommunity.com/dev/apikey");
                  }}
                  className="text-sky-400 underline font-bold cursor-pointer"
                >
                  steamcommunity.com/dev/apikey
                </a>
                . Inserisci qualsiasi nome a dominio (es. <code>localhost</code>) e genera la tua chiave a 32 caratteri.
              </p>
              <p>
                <strong>3. Privacy del profilo:</strong>
                <br />
                Nelle impostazioni di privacy del tuo account Steam, imposta <em>"Dettagli dei giochi"</em> su{" "}
                <strong>Pubblico</strong> e togli la spunta a <em>"Mantieni sempre privato il tempo di gioco"</em>.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTroubleshoot(false)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors"
              >
                Ho Capito
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
