import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Info,
  ShieldCheck,
  Check,
  ExternalLink,
  HelpCircle,
  LogOut,
  LogIn,
} from "lucide-react";
import { SteamIcon, EpicIcon, GogIcon, XboxIcon, AmazonIcon } from "../StoreBadge";
import soundEffects from "../../utils/soundEffects";
import { openExternalUrl } from "../../utils/openUrl";
import { useTranslation } from "../../i18n/i18nContext";
import { api, TAURI_EVENTS } from "../../api";
import {
  StoreAccount,
  StoreSyncProgress,
  StoreIntegrationSettings,
  DEFAULT_ACCOUNTS,
  listenTauri,
  formatLastSync,
} from "../store_accounts/types";
import { DisconnectStoreModal, StoreCleanupMode } from "../modals/DisconnectStoreModal";
import { SettingGroup, SettingRow, ToggleSwitch } from "./SettingsControls";

export type { StoreAccount, StoreSyncProgress, StoreIntegrationSettings };

export interface StoreAccountsTabProps {
  onSyncComplete?: () => void;
  onClose?: () => void;
  selectedStoreId?: string;
  onSelectStore?: (storeId: string) => void;
  hideTabBar?: boolean;
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

export const STORE_LIST: StoreItemMeta[] = [
  {
    id: "steam",
    name: "Steam",
    icon: (c = "w-4 h-4") => <SteamIcon className={`${c} text-[#66c0f4]`} />,
    tag: "API Key",
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
    id: "xbox",
    name: "Xbox / PC Game Pass",
    icon: (c = "w-4 h-4") => <XboxIcon className={`${c} text-[#107c10]`} />,
    tag: "OAuth",
  },
  {
    id: "amazon",
    name: "Amazon Games",
    icon: (c = "w-4 h-4") => <AmazonIcon className={`${c} text-[#ff9900]`} />,
    tag: "Locale",
  },
];

export const StoreAccountsTab: React.FC<StoreAccountsTabProps> = ({
  onSyncComplete,
  onClose,
  selectedStoreId: controlledStoreId,
  onSelectStore,
  hideTabBar = false,
}) => {
  const { t, locale } = useTranslation();
  const [internalStoreId, setInternalStoreId] = useState<string>("steam");
  const selectedStoreId = controlledStoreId ?? internalStoreId;

  const setSelectedStoreId = (id: string) => {
    setInternalStoreId(id);
    onSelectStore?.(id);
  };
  const [accounts, setAccounts] = useState<StoreAccount[]>(DEFAULT_ACCOUNTS);
  const [settingsMap, setSettingsMap] = useState<Record<string, StoreIntegrationSettings>>({});
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [syncProgress, setSyncProgress] = useState<Record<string, StoreSyncProgress>>({});
  const [banner, setBanner] = useState<{ type: "success" | "info" | "error"; message: string } | null>(null);
  const [showTroubleshoot, setShowTroubleshoot] = useState<boolean>(false);
  const [disconnectTarget, setDisconnectTarget] = useState<{ id: string; name: string } | null>(null);

  // Helper to load settings for a store
  const loadSettingsForStore = async (storeId: string) => {
    try {
      const res = await api.stores.getIntegrationSettings(storeId);
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
      const res = await api.stores.getStoreAccounts();
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
      const res = await api.stores.getVaultStatus();
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
        TAURI_EVENTS.STORE_ACCOUNT_CONNECTED,
        (payload) => {
          soundEffects.playSelect();
          const accName = payload.username ? `"${payload.username}"` : payload.store_id.toUpperCase();
          setBanner({
            type: "success",
            message: t("store_accounts.connected_success", { name: accName }),
          });
          loadAccounts();
          loadSettingsForStore(payload.store_id);
          if (onSyncComplete) onSyncComplete();
        }
      );

      unlistenDisconnected = await listenTauri<{ store_id: string }>(
        TAURI_EVENTS.STORE_ACCOUNT_DISCONNECTED,
        (payload) => {
          soundEffects.playSelect();
          setBanner({
            type: "info",
            message: t("store_accounts.disconnect_success", { store: payload.store_id.toUpperCase() }),
          });
          loadAccounts();
          loadSettingsForStore(payload.store_id);
          if (onSyncComplete) onSyncComplete();
        }
      );

      unlistenProgress = await listenTauri<StoreSyncProgress>(
        TAURI_EVENTS.STORE_SYNC_PROGRESS,
        (payload) => {
          setSyncProgress((prev) => ({
            ...prev,
            [payload.store_id]: payload,
          }));
          if (payload.status === "completed") {
            setBanner({
              type: "success",
              message:
                payload.message ||
                t("store_accounts.sync_completed", { store: payload.store_id.toUpperCase() }),
            });
            loadAccounts();
            if (onSyncComplete) onSyncComplete();
          } else if (payload.status === "error") {
            setBanner({
              type: "error",
              message:
                payload.message ||
                t("store_accounts.sync_error", { error: payload.store_id.toUpperCase() }),
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

  const currentMeta = STORE_LIST.find((s) => s.id === selectedStoreId) || STORE_LIST[0];

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
          message: t("store_accounts.steam_id_required"),
        });
        setIsSaving(false);
        return;
      }

      if (!key) {
        setBanner({
          type: "error",
          message: t("store_accounts.steam_api_key_required"),
        });
        setIsSaving(false);
        return;
      }
    }

    try {
      await api.stores.saveIntegrationSettings(currentSettings);
      const storeName = STORE_LIST.find((s) => s.id === selectedStoreId)?.name || selectedStoreId;
      setBanner({
        type: "success",
        message: t("store_accounts.save_success", { store: storeName }),
      });
      await loadAccounts();
      await loadSettingsForStore(selectedStoreId);
      if (onSyncComplete) onSyncComplete();
    } catch (err: any) {
      setBanner({
        type: "error",
        message: t("store_accounts.save_error", { error: err?.toString() || "Unknown error" }),
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
        message: `${selectedStoreId.toUpperCase()}...`,
      },
    }));

    try {
      await api.stores.syncStoreLibrary(selectedStoreId);
      setBanner({
        type: "info",
        message: t("store_accounts.sync_started", { store: selectedStoreId.toUpperCase() }),
      });
    } catch (err: any) {
      setBanner({
        type: "error",
        message: t("store_accounts.sync_error", { error: err?.toString() || "Unknown error" }),
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
        message: t("store_accounts.login_opening", { store: selectedStoreId.toUpperCase() }),
      });
      await api.stores.startStoreLogin(selectedStoreId);
    } catch (err: any) {
      setBanner({
        type: "error",
        message: t("store_accounts.login_error", { error: err?.toString() || "Unknown error" }),
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [selectedStoreId]: false }));
    }
  };

  const handleRequestDisconnect = (storeId: string, storeName: string) => {
    soundEffects.playSelect();
    setDisconnectTarget({ id: storeId, name: storeName });
  };

  const handleConfirmDisconnect = async (storeId: string, cleanupMode: StoreCleanupMode) => {
    soundEffects.playSelect();
    setActionLoading((prev) => ({ ...prev, [storeId]: true }));
    try {
      const deletedCount = await api.stores.disconnectStoreAccount(storeId, cleanupMode);
      if (storeId === "steam") {
        setSettingsMap((prev) => ({
          ...prev,
          steam: {
            ...(prev.steam || currentSettings),
            connect_account: false,
            account_id: "",
            api_key: "",
          },
        }));
      } else {
        updateSetting("connect_account", false);
      }

      const storeName = STORE_LIST.find((s) => s.id === storeId)?.name || storeId;
      const msg = deletedCount > 0
        ? `${t("store_accounts.disconnect_success", { store: storeName.toUpperCase() })} (${deletedCount} ${t("common.removed", { defaultValue: "rimossi" })})`
        : t("store_accounts.disconnect_success", { store: storeName.toUpperCase() });

      setBanner({
        type: "info",
        message: msg,
      });
      await loadAccounts();
      await loadSettingsForStore(storeId);
      if (onSyncComplete) onSyncComplete();
    } catch (err: any) {
      setBanner({
        type: "error",
        message: t("store_accounts.disconnect_error", { error: err?.toString() || "Unknown error" }),
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [storeId]: false }));
    }
  };

  const activeProgress = syncProgress[selectedStoreId];
  const isCurrentlySyncing = activeProgress?.status === "syncing" || actionLoading[selectedStoreId];

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none text-slate-200">
      {/* Top Banner Notifications */}
      {banner && (
        <div
          className={`mx-6 mt-4 p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${banner.type === "success"
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

      {/* Sub-tab Navigation matching General and Achievements tab header */}
      {!hideTabBar && (
        <div
          className="flex items-center gap-1 border-b px-6 py-2.5 bg-black/20 shrink-0 overflow-x-auto custom-scrollbar"
          style={{ borderColor: "var(--border-color)" }}
        >
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
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? "shadow-xs"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
                style={
                  isSelected
                    ? {
                        backgroundColor: "color-mix(in srgb, var(--accent-primary) 12%, transparent)",
                        color: "var(--accent-primary)",
                      }
                    : undefined
                }
              >
                {store.icon("w-3.5 h-3.5 shrink-0")}
                <span>{store.name}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    isConn ? "animate-pulse" : "bg-slate-600"
                  }`}
                  style={isConn ? { backgroundColor: "var(--accent-primary)" } : undefined}
                  title={
                    isConn
                      ? t("store_accounts.authenticated")
                      : t("store_accounts.not_authenticated")
                  }
                />
                {isSelected && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                    style={{ backgroundColor: "var(--accent-primary)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content for Selected Store */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar min-h-0">
        <SettingGroup
          title={currentMeta.name}
          description="Gestisci la connessione e le modalità di importazione dei giochi."
          icon={currentMeta.icon("w-4 h-4")}
        >
          <SettingRow
            title={t("store_accounts.import_installed")}
            description="Rileva ed elenca i giochi installati localmente sul computer."
          >
            <ToggleSwitch
              checked={currentSettings.import_installed}
              onChange={(val) => updateSetting("import_installed", val)}
              ariaLabel={t("store_accounts.import_installed")}
            />
          </SettingRow>

          <SettingRow
            title={t("store_accounts.connect_account")}
            description="Collega l'account per sincronizzare libreria cloud, tempi di gioco e dettagli."
            badge={
              currentAccount.is_connected ? (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
                    borderColor: "color-mix(in srgb, var(--accent-primary) 30%, transparent)",
                    color: "var(--accent-primary)",
                  }}
                >
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                  <span>{t("store_accounts.authenticated")}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/5 text-slate-400 border border-white/10">
                  <span>{t("store_accounts.not_authenticated")}</span>
                </span>
              )
            }
          >
            <ToggleSwitch
              checked={currentSettings.connect_account}
              onChange={(val) => updateSetting("connect_account", val)}
              ariaLabel={t("store_accounts.connect_account")}
            />
          </SettingRow>
        </SettingGroup>

        {/* Sub-options when "Connetti l'account" is enabled */}
        {currentSettings.connect_account && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <SettingGroup
              title="Filtri & Opzioni Sincronizzazione"
              description="Personalizza quali contenuti sincronizzare dalla piattaforma."
            >
              <SettingRow
                title={t("store_accounts.import_uninstalled")}
                description="Importa nella libreria Omnis anche i titoli posseduti ma non scaricati."
              >
                <ToggleSwitch
                  checked={currentSettings.import_uninstalled}
                  onChange={(val) => updateSetting("import_uninstalled", val)}
                  ariaLabel={t("store_accounts.import_uninstalled")}
                />
              </SettingRow>

              <SettingRow
                title={t("store_accounts.ignore_other_accounts")}
                description="Ignora i giochi installati da altri account utente rilevati localmente."
              >
                <ToggleSwitch
                  checked={currentSettings.ignore_other_accounts}
                  onChange={(val) => updateSetting("ignore_other_accounts", val)}
                  ariaLabel={t("store_accounts.ignore_other_accounts")}
                />
              </SettingRow>

              {selectedStoreId === "steam" && (
                <>
                  <SettingRow
                    title={t("store_accounts.import_free_items")}
                    description="Include oggetti gratuiti, software e strumenti associati alla licenza Steam."
                  >
                    <ToggleSwitch
                      checked={currentSettings.import_free_items || false}
                      onChange={(val) => updateSetting("import_free_items", val)}
                      ariaLabel={t("store_accounts.import_free_items")}
                    />
                  </SettingRow>

                  <SettingRow
                    title={t("store_accounts.import_family_sharing")}
                    description="Include i titoli condivisi dagli altri membri della famiglia Steam."
                  >
                    <ToggleSwitch
                      checked={currentSettings.import_family_sharing ?? true}
                      onChange={(val) => updateSetting("import_family_sharing", val)}
                      ariaLabel={t("store_accounts.import_family_sharing")}
                    />
                  </SettingRow>
                </>
              )}

              {selectedStoreId === "xbox" && (
                <SettingRow
                  title={t("store_accounts.include_game_pass")}
                  description="Importa il catalogo dei titoli disponibili con abbonamento Xbox Game Pass."
                >
                  <ToggleSwitch
                    checked={currentSettings.import_game_pass ?? true}
                    onChange={(val) => updateSetting("import_game_pass", val)}
                    ariaLabel={t("store_accounts.include_game_pass")}
                  />
                </SettingRow>
              )}
            </SettingGroup>

            {/* STEAM SPECIFIC: API KEY LOGIN */}
            {selectedStoreId === "steam" && (
              <div
                className="p-4 rounded-2xl border space-y-4 shadow-xs"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                {/* Steam Active Session Banner & Disconnect */}
                {currentAccount.is_connected && (
                  <div
                    className="flex items-center justify-between p-3.5 rounded-xl border"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--accent-primary) 10%, transparent)",
                      borderColor: "color-mix(in srgb, var(--accent-primary) 25%, transparent)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {currentAccount.avatar_url ? (
                        <img
                          src={currentAccount.avatar_url}
                          alt="Avatar"
                          className="w-8 h-8 rounded-full border object-cover"
                          style={{ borderColor: "var(--accent-primary)" }}
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs"
                          style={{
                            backgroundColor: "color-mix(in srgb, var(--accent-primary) 20%, transparent)",
                            borderColor: "var(--accent-primary)",
                            color: "var(--accent-primary)",
                          }}
                        >
                          <SteamIcon className="w-4 h-4 text-[#66c0f4]" />
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-bold text-white">
                          {currentAccount.username || t("store_accounts.connected_user")}
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--accent-primary)" }}>
                          {t("store_accounts.active_session")}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRequestDisconnect("steam", "Steam")}
                      disabled={actionLoading["steam"]}
                      className="px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/15 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{t("store_accounts.disconnect")}</span>
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: "var(--accent-primary)" }}
                    />
                    <label className="text-xs font-bold" style={{ color: "var(--accent-primary)" }}>
                      {t("store_accounts.api_key_login")}
                    </label>
                  </div>
                  <span
                    className="text-[10px] uppercase font-mono px-2 py-0.5 rounded border"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
                      borderColor: "color-mix(in srgb, var(--accent-primary) 30%, transparent)",
                      color: "var(--accent-primary)",
                    }}
                  >
                    {t("store_accounts.required_for_achievements")}
                  </span>
                </div>

                {/* ID Account Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-slate-300">
                      {t("store_accounts.account_id")}
                    </label>
                    <a
                      href="https://steamcommunity.com/my"
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => {
                        e.preventDefault();
                        openExternalUrl("https://steamcommunity.com/my");
                      }}
                      className="text-xs font-bold inline-flex items-center gap-1 cursor-pointer hover:underline"
                      style={{ color: "var(--accent-primary)" }}
                    >
                      <span>{t("store_accounts.get_account_id")}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <input
                    type="text"
                    value={currentSettings.account_id || ""}
                    onChange={(e) => updateSetting("account_id", e.target.value.trim())}
                    placeholder={t("store_accounts.account_id_placeholder")}
                    className="w-full bg-slate-900/90 border border-white/20 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-hidden shadow-inner"
                    style={{ borderColor: "var(--border-color)" }}
                  />
                </div>

                {/* Chiave API Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-slate-300">
                      {t("store_accounts.api_key")}
                    </label>
                    <a
                      href="https://steamcommunity.com/dev/apikey"
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => {
                        e.preventDefault();
                        openExternalUrl("https://steamcommunity.com/dev/apikey");
                      }}
                      className="text-xs font-bold inline-flex items-center gap-1 cursor-pointer hover:underline"
                      style={{ color: "var(--accent-primary)" }}
                    >
                      <span>{t("store_accounts.get_api_key")}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <input
                    type="password"
                    value={currentSettings.api_key || ""}
                    onChange={(e) => updateSetting("api_key", e.target.value.trim())}
                    placeholder={t("store_accounts.api_key_placeholder")}
                    className="w-full bg-slate-900/90 border border-white/20 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-hidden shadow-inner"
                    style={{ borderColor: "var(--border-color)" }}
                  />
                </div>
              </div>
            )}

            {/* OAUTH STORES: EPIC, GOG, XBOX */}
            {selectedStoreId !== "steam" && (
              <div
                className="p-4 rounded-2xl border space-y-3 shadow-xs"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">
                    {t("store_accounts.cloud_auth")}
                  </span>
                  {currentAccount.last_sync && (
                    <span className="text-[11px] text-slate-400">
                      {t("store_accounts.last_sync", {
                        time: formatLastSync(currentAccount.last_sync, locale, t("store_accounts.never_synced")),
                      })}
                    </span>
                  )}
                </div>

                {currentAccount.is_connected ? (
                  <div
                    className="flex items-center justify-between p-3.5 rounded-xl border"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--accent-primary) 10%, transparent)",
                      borderColor: "color-mix(in srgb, var(--accent-primary) 25%, transparent)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {currentAccount.avatar_url ? (
                        <img
                          src={currentAccount.avatar_url}
                          alt="Avatar"
                          className="w-8 h-8 rounded-full border object-cover"
                          style={{ borderColor: "var(--accent-primary)" }}
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs"
                          style={{
                            backgroundColor: "color-mix(in srgb, var(--accent-primary) 20%, transparent)",
                            borderColor: "var(--accent-primary)",
                            color: "var(--accent-primary)",
                          }}
                        >
                          {currentAccount.username?.charAt(0).toUpperCase() || "U"}
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-bold text-white">
                          {currentAccount.username || t("store_accounts.connected_user")}
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--accent-primary)" }}>
                          {t("store_accounts.active_session")}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const sName = STORE_LIST.find((s) => s.id === selectedStoreId)?.name || selectedStoreId;
                        handleRequestDisconnect(selectedStoreId, sName);
                      }}
                      disabled={actionLoading[selectedStoreId]}
                      className="px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/15 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{t("store_accounts.disconnect")}</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/10">
                    <p className="text-xs text-slate-400">
                      {t("store_accounts.oauth_desc")}
                    </p>
                    <button
                      type="button"
                      onClick={handleConnectOAuth}
                      disabled={actionLoading[selectedStoreId]}
                      className="px-4 py-2 rounded-xl text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 hover:brightness-110 active:scale-95"
                      style={{
                        backgroundColor: "var(--accent-primary)",
                        boxShadow: "0 4px 14px var(--accent-glow)",
                      }}
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>{t("store_accounts.connect")}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Troubleshoot link */}
            <div>
              <button
                type="button"
                onClick={() => setShowTroubleshoot(true)}
                className="text-xs font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                style={{ color: "var(--accent-primary)" }}
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{t("store_accounts.troubleshoot")}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div
        className="flex items-center justify-between px-6 py-4 border-t bg-black/40 shrink-0"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncCurrent}
            disabled={isCurrentlySyncing || !currentAccount.is_connected}
            title={
              isCurrentlySyncing
                ? t("store_accounts.syncing")
                : t("store_accounts.sync_now")
            }
            aria-label={
              isCurrentlySyncing
                ? t("store_accounts.syncing")
                : t("store_accounts.sync_now")
            }
            className="p-2.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-white flex items-center justify-center cursor-pointer disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${isCurrentlySyncing ? "animate-spin text-sky-400" : ""}`} />
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 rounded-xl text-xs font-bold text-white shadow-md hover:brightness-110 active:opacity-90 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: "var(--accent-primary)" }}
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span>{t("common.save")}</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/10 hover:bg-white/10 transition-colors text-slate-300 cursor-pointer"
            >
              {t("common.cancel")}
            </button>
          )}
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
                <span>
                  {t("store_accounts.troubleshoot_title")}
                </span>
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
                <strong>
                  {t("store_accounts.troubleshoot_step1_title")}
                </strong>
                <br />
                {t("store_accounts.troubleshoot_step1_desc")}
              </p>
              <p>
                <strong>
                  {t("store_accounts.troubleshoot_step2_title")}
                </strong>
                <br />
                {t("store_accounts.troubleshoot_step2_desc")}{" "}
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
              </p>
              <p>
                <strong>
                  {t("store_accounts.troubleshoot_step3_title")}
                </strong>
                <br />
                {t("store_accounts.troubleshoot_step3_desc")}
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTroubleshoot(false)}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all cursor-pointer hover:brightness-110 active:scale-95"
                style={{ backgroundColor: "var(--accent-primary)" }}
              >
                {t("store_accounts.troubleshoot_got_it")}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Disconnect confirmation modal with library cleanup options */}
      <DisconnectStoreModal
        isOpen={disconnectTarget !== null}
        storeId={disconnectTarget?.id || ""}
        storeName={disconnectTarget?.name || ""}
        onClose={() => setDisconnectTarget(null)}
        onConfirm={handleConfirmDisconnect}
      />
    </div>
  );
};
