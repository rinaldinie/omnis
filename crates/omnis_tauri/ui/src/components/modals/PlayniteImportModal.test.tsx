import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import PlayniteImportModal from "./PlayniteImportModal";
import { I18nProvider } from "@/i18n";
import { api } from "@/api";
import { TAURI_EVENTS, type PlayniteImportProgressPayload, type PlayniteImportStats } from "@/types";

let capturedProgressCallback: ((event: { payload: PlayniteImportProgressPayload }) => void) | null = null;
const unlistenMock = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    async (
      event: string,
      cb: (payload: { payload: PlayniteImportProgressPayload }) => void
    ) => {
      if (event === TAURI_EVENTS.PLAYNITE_IMPORT_PROGRESS) {
        capturedProgressCallback = cb;
      }
      return unlistenMock;
    }
  ),
}));

vi.mock("@/utils/soundEffects", () => ({
  default: {
    playSelect: vi.fn(),
    playUnlock: vi.fn(),
  },
}));

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      playnite: {
        ...actual.api.playnite,
        pickBackupFile: vi.fn(),
        inspectBackup: vi.fn(),
        executeImport: vi.fn(),
      },
    },
  };
});

const sampleInspection = {
  total_games_in_backup: 10,
  matching_games_in_library: 4,
  non_matching_games: 6,
  playtime_updates_available: 3,
  missing_covers_available: 2,
  missing_backgrounds_available: 1,
  sample_matches: [
    {
      title: "Hollow Knight",
      library_id: "steam",
      existing_playtime_seconds: 1800,
      backup_playtime_seconds: 7200,
      has_playtime_update: true,
      cover_available: true,
      background_available: false,
    },
    {
      title: "Celeste",
      library_id: "epic",
      existing_playtime_seconds: 3600,
      backup_playtime_seconds: 3600,
      has_playtime_update: false,
      cover_available: false,
      background_available: true,
    },
  ],
  unmatched_in_library: [
    {
      title: "Unmatched Title",
      library_id: "gog",
      external_id: "gog-999",
    },
  ],
};

describe("PlayniteImportModal multi-step IPC flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProgressCallback = null;
  });

  it("runs pick -> inspect -> preview filter -> progress -> completed summary flow", async () => {
    const onSuccess = vi.fn();
    let resolveImport!: (value: PlayniteImportStats) => void;

    vi.mocked(api.playnite.pickBackupFile).mockResolvedValueOnce("C:\\backups\\playnite.zip");
    vi.mocked(api.playnite.inspectBackup).mockResolvedValueOnce(sampleInspection);
    vi.mocked(api.playnite.executeImport).mockImplementationOnce(
      () =>
        new Promise<PlayniteImportStats>((resolve) => {
          resolveImport = resolve;
        })
    );

    render(
      <I18nProvider initialLocale="en">
        <PlayniteImportModal isOpen={true} onClose={vi.fn()} onSuccess={onSuccess} />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Browse Backup File..." }));

    await waitFor(() => {
      expect(screen.getByText("Hollow Knight")).toBeTruthy();
      expect(screen.getByText("Celeste")).toBeTruthy();
    });

    // Search filters preview list
    const searchInput = screen.getByPlaceholderText("Search game by title...");
    fireEvent.change(searchInput, { target: { value: "Hollow" } });
    expect(screen.getByText("Hollow Knight")).toBeTruthy();
    expect(screen.queryByText("Celeste")).toBeNull();

    // Switch to unmatched tab
    const unmatchedTab = screen.getByRole("tab", { name: /Not in Backup/i });
    fireEvent.mouseDown(unmatchedTab);
    fireEvent.click(unmatchedTab);
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getByText("Unmatched Title")).toBeTruthy();

    // Start import and verify live progress updates
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Import" }));

    await waitFor(() => {
      expect(capturedProgressCallback).not.toBeNull();
    });

    act(() => {
      capturedProgressCallback?.({
        payload: { current: 2, total: 4, message: "Syncing Hollow Knight" },
      });
    });

    expect(screen.getByText("2 / 4 (50%)")).toBeTruthy();

    await act(async () => {
      resolveImport({
        total_read: 10,
        games_created: 0,
        games_merged: 4,
        playtime_updated: 3,
        images_cached: 5,
        tags_added: 0,
        categories_added: 0,
        sessions_imported: 12,
      });
    });

    await waitFor(() => {
      expect(screen.getByText("12")).toBeTruthy();
      expect(screen.getByText("Import Completed Successfully!")).toBeTruthy();
    });

    expect(api.playnite.executeImport).toHaveBeenCalledWith("C:\\backups\\playnite.zip", {
      image_cache_dir: null,
      import_images: true,
      update_playtime: true,
      dry_run: false,
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(unlistenMock).toHaveBeenCalledTimes(1);
  });

  it("displays inspection IPC error and returns to idle when clicking retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(api.playnite.pickBackupFile).mockResolvedValueOnce("C:\\backups\\broken.zip");
    vi.mocked(api.playnite.inspectBackup).mockRejectedValueOnce(new Error("Corrupt zip header"));

    render(
      <I18nProvider initialLocale="en">
        <PlayniteImportModal isOpen={true} onClose={vi.fn()} />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Browse Backup File..." }));

    await waitFor(() => {
      expect(screen.getByText("Corrupt zip header")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("button", { name: "Browse Backup File..." })).toBeTruthy();
  });
});
