import { gamesApi } from "./games";
import { backupApi } from "./backup";
import { storesApi } from "./stores";
import { metadataApi } from "./metadata";
import { statsApi } from "./stats";
import { windowApi } from "./window";
import { themesApi } from "./themes";
import { achievementsApi } from "./achievements";
import { playniteApi } from "./playnite";
import { slotsApi } from "./slots";

export * from "./client";
export * from "./events";
export * from "./slots";
export * from "./games";
export * from "./backup";
export * from "./stores";
export * from "./metadata";
export * from "./stats";
export * from "./window";
export * from "./themes";
export * from "./achievements";
export * from "./playnite";

export const api = {
  games: gamesApi,
  backup: backupApi,
  stores: storesApi,
  metadata: metadataApi,
  stats: statsApi,
  window: windowApi,
  themes: themesApi,
  achievements: achievementsApi,
  playnite: playniteApi,
  slots: slotsApi,
};

export default api;
