// Screenshot harness: boots the real UI in a plain browser with the Tauri IPC mocked
// by a demo library. Served by `npm run dev` at /screenshots/index.html.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { BUILTIN_THEMES } from "../src/types";
import * as demo from "./demoData";

const params = new URLSearchParams(location.search);

const prefs: Record<string, string> = {
  omnis_onboarding_completed: "true",
  omnis_auto_scan_on_startup: "false",
  omnis_language: params.get("lang") ?? "en",
  omnis_sound_enabled: "false",
  omnis_selected_theme_id: params.get("theme") ?? "cyberpunk",
};
for (const [k, v] of Object.entries(prefs)) localStorage.setItem(k, v);

const unknown = new Set<string>();

mockWindows("main");
mockIPC(
  (cmd, payload) => {
    const args = (payload ?? {}) as Record<string, any>;
    switch (cmd) {
      case "get_games":
        return demo.GAMES;
      case "get_counts":
        return demo.counts();
      case "get_themes":
        return BUILTIN_THEMES;
      case "get_slot_widgets":
        return demo.slotWidgets(args.slotName, args.gameId);
      case "get_game_achievements":
      case "refresh_game_achievements":
        return demo.achievements(args.gameId);
      case "get_global_statistics":
        return demo.globalStats(args.year);
      case "get_game_statistics":
        return demo.gameStats(args.gameId);
      case "get_store_accounts":
        return demo.STORE_ACCOUNTS;
      case "get_running_game":
        return null;
      case "is_fullscreen_launch":
        return false;
      case "get_vault_status":
        return { is_fallback: false, warning: null };
      case "get_game_trailer_url":
        return null;
      case "plugin:window|is_fullscreen":
        return params.has("fullscreen");
      case "plugin:updater|check":
        return null;
      case "plugin:app|version":
        return "0.12.1";
      default:
        if (!unknown.has(cmd)) {
          unknown.add(cmd);
          console.debug("[demo] unmocked IPC:", cmd, args);
        }
        return null;
    }
  },
  { shouldMockEvents: true }
);

(window as any).__omnisDemo = { unknown };

await import("../src/main");
