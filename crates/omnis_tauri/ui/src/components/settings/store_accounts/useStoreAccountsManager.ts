import { useState, useEffect, useRef } from "react";
import soundEffects from "../../../utils/soundEffects";
import { useTranslation } from "../../../i18n/i18nContext";
import { api, TAURI_EVENTS } from "../../../api";
import {
  StoreAccount,
  StoreSyncProgress,
  StoreIntegrationSettings,
  DEFAULT_ACCOUNTS,
  listenTauri,
} from "../../store_accounts/types";
import { StoreCleanupMode } from "../../modals/DisconnectStoreModal";
import { STORE_LIST } from "./storeListConfig";

export interface VaultStatus {
  is_fallback: boolean;
  warning?: string | null;
}

export function useStoreAccountsManager(onSyncComplete?: () => void) {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
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
      console.debug("Vault status not available:", e);
    }
  };

  useEffect(() => {
    loadAccounts();
    checkVaultStatus();
    STORE_LIST.forEach((s) => loadSettingsForStore(s.id));

    let unlistenSync: (() => void) | null = null;
    let unlistenConnected: (() => void) | null = null;
    let unlistenDisconnected: (() => void) | null = null;

    listenTauri<StoreSyncProgress>(TAURI_EVENTS.STORE_SYNC_PROGRESS, (payload) => {
      setSyncProgress((prev) => ({ ...prev, [payload.store_id]: payload }));
    }).then((fn) => {
      unlistenSync = fn;
    });

    listenTauri<{ store_id: string }>(TAURI_EVENTS.STORE_ACCOUNT_CONNECTED, (payload) => {
      loadAccounts();
      loadSettingsForStore(payload.store_id);
      setBanner({
        type: "success",
        message: tRef.current("store_accounts.connected_success", { store: payload.store_id }),
      });
      soundEffects.playSelect();
    }).then((fn) => {
      unlistenConnected = fn;
    });

    listenTauri<{ store_id: string }>(TAURI_EVENTS.STORE_ACCOUNT_DISCONNECTED, (payload) => {
      loadAccounts();
      setBanner({
        type: "info",
        message: tRef.current("store_accounts.disconnected_success", { store: payload.store_id }),
      });
    }).then((fn) => {
      unlistenDisconnected = fn;
    });

    return () => {
      if (unlistenSync) unlistenSync();
      if (unlistenConnected) unlistenConnected();
      if (unlistenDisconnected) unlistenDisconnected();
    };
  }, []);

  const updateSetting = (storeId: string, key: keyof StoreIntegrationSettings, value: any) => {
    setSettingsMap((prev) => {
      const current = prev[storeId] || {
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
      };
      return {
        ...prev,
        [storeId]: { ...current, [key]: value },
      };
    });
  };

  const handleSaveSettings = async (storeId: string) => {
    const s = settingsMap[storeId];
    if (!s) return;
    setIsSaving(true);
    try {
      await api.stores.saveIntegrationSettings(s);
      soundEffects.playSelect();
      setBanner({ type: "success", message: t("store_accounts.saved_success") });
      setTimeout(() => setBanner(null), 3000);
    } catch (e: any) {
      soundEffects.playSelect();
      setBanner({
        type: "error",
        message: t("store_accounts.save_failed", { error: String(e) }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectOAuth = async (storeId: string) => {
    setActionLoading((prev) => ({ ...prev, [storeId]: true }));
    try {
      soundEffects.playSelect();
      await api.stores.startStoreLogin(storeId);
    } catch (e: any) {
      soundEffects.playSelect();
      setBanner({
        type: "error",
        message: t("store_accounts.auth_failed", { error: String(e) }),
      });
      setActionLoading((prev) => ({ ...prev, [storeId]: false }));
    }
  };

  const handleConfirmDisconnect = async (storeId: string, cleanupMode: StoreCleanupMode) => {
    setDisconnectTarget(null);
    setActionLoading((prev) => ({ ...prev, [storeId]: true }));
    try {
      await api.stores.disconnectStoreAccount(storeId, cleanupMode);
      soundEffects.playSelect();
      await loadAccounts();
      if (onSyncComplete) onSyncComplete();
    } catch (e: any) {
      soundEffects.playSelect();
      setBanner({
        type: "error",
        message: t("store_accounts.disconnect_failed", { error: String(e) }),
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [storeId]: false }));
    }
  };

  const handleManualSync = async (storeId: string) => {
    setActionLoading((prev) => ({ ...prev, [storeId]: true }));
    try {
      soundEffects.playSelect();
      setBanner({
        type: "info",
        message: t("store_accounts.syncing_store", { store: storeId }),
      });
      await api.stores.syncStoreLibrary(storeId);
      soundEffects.playSelect();
      setBanner({
        type: "success",
        message: t("store_accounts.sync_complete", { store: storeId }),
      });
      await loadAccounts();
      if (onSyncComplete) onSyncComplete();
      setTimeout(() => setBanner(null), 4000);
    } catch (e: any) {
      soundEffects.playSelect();
      setBanner({
        type: "error",
        message: t("store_accounts.sync_failed", { error: String(e) }),
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [storeId]: false }));
    }
  };

  return {
    accounts,
    settingsMap,
    vaultStatus,
    isLoading,
    isSaving,
    actionLoading,
    syncProgress,
    banner,
    setBanner,
    showTroubleshoot,
    setShowTroubleshoot,
    disconnectTarget,
    setDisconnectTarget,
    updateSetting,
    handleSaveSettings,
    handleConnectOAuth,
    handleConfirmDisconnect,
    handleManualSync,
  };
}
