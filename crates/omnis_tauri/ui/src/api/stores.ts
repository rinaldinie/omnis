import { invokeIpc } from "./client";
import type { VaultStatus } from "../types";
import type { StoreAccount, StoreIntegrationSettings } from "../components/store_accounts/types";

export const storesApi = {
  /** Fetch all connected store accounts */
  getStoreAccounts: (): Promise<StoreAccount[]> =>
    invokeIpc<StoreAccount[]>("get_store_accounts"),

  /** Fetch integration settings for a specific store */
  getIntegrationSettings: (storeId: string): Promise<StoreIntegrationSettings> =>
    invokeIpc<StoreIntegrationSettings>("get_store_integration_settings", { storeId }),

  /** Save integration settings for a store */
  saveIntegrationSettings: (settings: StoreIntegrationSettings): Promise<void> =>
    invokeIpc<void>("save_store_integration_settings", { settings }),

  /** Trigger synchronization of games for a specific store (or all) */
  syncStoreLibrary: (storeId?: string): Promise<number> =>
    invokeIpc<number>("sync_store_library", { storeId }),

  /** Initiate OAuth / credential login flow for a store */
  startStoreLogin: (storeId: string): Promise<void> =>
    invokeIpc<void>("start_store_login", { storeId }),

  /** Disconnect and revoke credentials for a store */
  disconnectStoreAccount: (storeId: string): Promise<void> =>
    invokeIpc<void>("disconnect_store_account", { storeId }),

  /** Save store API key */
  saveStoreApiKey: (storeId: string, apiKey: string): Promise<void> =>
    invokeIpc<void>("save_store_api_key", { storeId, apiKey }),

  /** Get OS keyring vault status */
  getVaultStatus: (): Promise<VaultStatus> => invokeIpc<VaultStatus>("get_vault_status"),
};
