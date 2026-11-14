import { useSyncExternalStore } from "react";

/** Console (fullscreen) mode preferences, persisted in localStorage and shared across components. */
export interface ConsolePrefs {
  /** Clock in the top bar and in the menu header */
  showClock: boolean;
  /** Battery icon in the top bar (only on devices with a battery) */
  showBattery: boolean;
  /** Battery percentage next to the icon */
  showBatteryPercent: boolean;
  /** Start every session with no library filters (otherwise the last ones are restored) */
  clearFiltersOnStartup: boolean;
  /** Quick filter tab IDs hidden from the fullscreen top bar */
  hiddenQuickFilters: string[];
}

export const CONSOLE_PREFS_STORAGE_KEY = "omnis_fullscreen_prefs";

export const DEFAULT_CONSOLE_PREFS: ConsolePrefs = {
  showClock: true,
  showBattery: true,
  showBatteryPercent: true,
  clearFiltersOnStartup: true,
  hiddenQuickFilters: [],
};

let cache: ConsolePrefs | null = null;
const listeners = new Set<() => void>();

function readPrefs(): ConsolePrefs {
  try {
    const raw = localStorage.getItem(CONSOLE_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_CONSOLE_PREFS;
    const parsed = JSON.parse(raw) as Partial<ConsolePrefs>;
    const prefs = { ...DEFAULT_CONSOLE_PREFS };
    (Object.keys(DEFAULT_CONSOLE_PREFS) as Array<keyof ConsolePrefs>).forEach((key) => {
      if (key === "hiddenQuickFilters") {
        if (Array.isArray(parsed.hiddenQuickFilters)) {
          prefs.hiddenQuickFilters = parsed.hiddenQuickFilters.filter((v): v is string => typeof v === "string");
        }
      } else if (typeof parsed[key] === "boolean") {
        prefs[key] = parsed[key] as boolean;
      }
    });
    return prefs;
  } catch {
    return DEFAULT_CONSOLE_PREFS;
  }
}

export function getConsolePrefs(): ConsolePrefs {
  if (!cache) cache = readPrefs();
  return cache;
}

export function setConsolePref<K extends keyof ConsolePrefs>(key: K, value: ConsolePrefs[K]): void {
  const next = { ...getConsolePrefs(), [key]: value };
  cache = next;
  try {
    localStorage.setItem(CONSOLE_PREFS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Not persisted, still applied for this session
  }
  listeners.forEach((listener) => listener());
}

/** Drops the in-memory copy so the next read comes from storage (tests). */
export function resetConsolePrefsCache(): void {
  cache = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConsolePrefs(): ConsolePrefs {
  return useSyncExternalStore(subscribe, getConsolePrefs, getConsolePrefs);
}
