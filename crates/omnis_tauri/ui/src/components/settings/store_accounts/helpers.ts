import type { StoreAccount } from "../../../types";

export function formatLastSync(
  isoStr: string | null | undefined,
  locale: string,
  neverLabel: string
): string {
  if (!isoStr) return neverLabel;
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString(locale, {
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
