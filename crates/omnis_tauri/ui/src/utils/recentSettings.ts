export interface RecentSettings {
  maxCount: number; // e.g. 5, 10, 20, 50, 100 (default: 20)
  timeWindowDays: number; // 0 = all time (default: 0), or 7, 30, 60, 90, 180, 365
}

export const RECENT_SETTINGS_STORAGE_KEY = 'omnis_recent_settings';

export const DEFAULT_RECENT_SETTINGS: RecentSettings = {
  maxCount: 20,
  timeWindowDays: 0, // 0 = no time window limit
};

export function getRecentSettings(): RecentSettings {
  try {
    const raw = localStorage.getItem(RECENT_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        maxCount: typeof parsed.maxCount === 'number' && parsed.maxCount > 0 ? parsed.maxCount : DEFAULT_RECENT_SETTINGS.maxCount,
        timeWindowDays: typeof parsed.timeWindowDays === 'number' && parsed.timeWindowDays >= 0 ? parsed.timeWindowDays : DEFAULT_RECENT_SETTINGS.timeWindowDays,
      };
    }
  } catch {
    // fallback
  }
  return DEFAULT_RECENT_SETTINGS;
}

export function saveRecentSettings(settings: RecentSettings): void {
  try {
    localStorage.setItem(RECENT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event('omnis_recent_settings_changed'));
  } catch {
    // ignore
  }
}
