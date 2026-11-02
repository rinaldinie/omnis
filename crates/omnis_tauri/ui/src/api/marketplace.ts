import { invokeIpc } from "./client";
import type { MarketplaceCatalog } from "../components/settings/MarketplaceTab";

export const marketplaceApi = {
  /** Fetch catalog of available community plugins and themes */
  getCatalog: (): Promise<MarketplaceCatalog> =>
    invokeIpc<MarketplaceCatalog>("get_marketplace_catalog"),

  /** Download and install a community plugin */
  installPlugin: (pluginId: string): Promise<void> =>
    invokeIpc<void>("install_marketplace_plugin", { pluginId }),

  /** Uninstall a community plugin */
  uninstallPlugin: (pluginId: string): Promise<void> =>
    invokeIpc<void>("uninstall_marketplace_plugin", { pluginId }),
};
