import { describe, it, expect } from "vitest";
import { TAURI_EVENTS } from "./events";

describe("TAURI_EVENTS constants", () => {
  it("defines standard catalog events matching omnis_sdk", () => {
    expect(TAURI_EVENTS.LIBRARY_UPDATED).toBe("library-updated");
    expect(TAURI_EVENTS.GAME_UPDATED).toBe("game-updated");
    expect(TAURI_EVENTS.GAME_DELETED).toBe("game-deleted");
  });

  it("defines game lifecycle events", () => {
    expect(TAURI_EVENTS.GAME_STARTED).toBe("game-started");
    expect(TAURI_EVENTS.GAME_STOPPED).toBe("game-stopped");
    expect(TAURI_EVENTS.GAME_STATUS_CHANGED).toBe("game-status-changed");
  });

  it("defines store integration events", () => {
    expect(TAURI_EVENTS.STORE_SYNC_PROGRESS).toBe("store-sync-progress");
    expect(TAURI_EVENTS.STORE_ACCOUNT_CONNECTED).toBe("store-account-connected");
    expect(TAURI_EVENTS.STORE_ACCOUNT_DISCONNECTED).toBe("store-account-disconnected");
  });

  it("defines achievement events", () => {
    expect(TAURI_EVENTS.ACHIEVEMENT_SYNC_PROGRESS).toBe("achievement-sync-progress");
    expect(TAURI_EVENTS.ACHIEVEMENTS_UPDATED).toBe("achievements-updated");
  });

  it("defines playnite import events", () => {
    expect(TAURI_EVENTS.PLAYNITE_IMPORT_PROGRESS).toBe("playnite://import-progress");
  });
});
