import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface StoreAccount {
  store_id: string;
  name: string;
  is_connected: boolean;
  username: string | null;
  avatar_url: string | null;
  last_sync: string | null;
  has_api_key?: boolean | null;
  is_syncing?: boolean;
}

export interface StoreSyncProgress {
  store_id: string;
  current: number;
  total: number;
  status: string; // 'syncing' | 'completed' | 'error'
  message?: string;
}

export async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.warn(`Tauri command '${cmd}' not available:`, err);
  }
  return null;
}

export async function listenTauri<T>(event: string, handler: (payload: T) => void): Promise<(() => void) | null> {
  try {
    return await listen<T>(event, (e) => handler(e.payload));
  } catch (err) {
    console.warn(`Tauri listen '${event}' not available:`, err);
  }
  return null;
}

export function formatLastSync(isoStr: string | null | undefined): string {
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

export const DEFAULT_ACCOUNTS: StoreAccount[] = [
  {
    store_id: "steam",
    name: "Steam",
    is_connected: false,
    username: null,
    avatar_url: null,
    last_sync: null,
  },
  {
    store_id: "epic",
    name: "Epic Games Store",
    is_connected: false,
    username: null,
    avatar_url: null,
    last_sync: null,
  },
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
];

export const FUTURE_STORES = [
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
