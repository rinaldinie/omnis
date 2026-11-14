import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import BatchEnrichModal from "./BatchEnrichModal";
import { I18nProvider } from "@/i18n";
import { api } from "@/api";
import { useUiStore } from "@/stores";
import {
  cancelBackgroundMetadataDownload,
  resetMetadataDownloadRunner,
} from "@/services/metadataBackgroundRunner";
import { type GameDto } from "@/types";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      metadata: {
        ...actual.api.metadata,
        downloadBatchMetadata: vi.fn(),
        cancelMetadataDownload: vi.fn().mockResolvedValue(undefined),
      },
      games: {
        ...actual.api.games,
        refreshGameHowlongtobeat: vi.fn().mockResolvedValue(0),
      },
      achievements: {
        ...actual.api.achievements,
        refreshGameAchievements: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
});

const games: GameDto[] = [
  {
    id: "g1",
    external_id: "1",
    title: "Hollow Knight",
    library: "steam",
    playtime_seconds: 1000,
    playtime_formatted: "16m",
    critic_score: null,
    release_date: null,
    description: null,
    cover_image: null,
    background_image: null,
    is_installed: true,
    is_favorite: false,
    is_hidden: false,
    genres: ["Indie"],
    developers: ["Team Cherry"],
    publishers: ["Team Cherry"],
    features: [],
    custom_links: [],
  },
  {
    id: "g2",
    external_id: "2",
    title: "Manual DRM-Free",
    library: "manual",
    playtime_seconds: 0,
    playtime_formatted: "0m",
    critic_score: null,
    release_date: null,
    description: null,
    cover_image: "cover.jpg",
    background_image: null,
    is_installed: false,
    is_favorite: false,
    is_hidden: false,
    genres: [],
    developers: [],
    publishers: [],
    features: [],
    custom_links: [],
  },
];

describe("BatchEnrichModal background IPC flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMetadataDownloadRunner();
    useUiStore.setState({ metadataDownload: null });
  });

  it("closes immediately on start, runs batch download in background, and supports cancellation", async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    let resolveDownload!: (updated: number) => void;
    vi.mocked(api.metadata.downloadBatchMetadata).mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          resolveDownload = resolve;
        })
    );

    const { rerender } = render(
      <I18nProvider initialLocale="en">
        <BatchEnrichModal
          isOpen={true}
          onClose={onClose}
          allGames={games}
          filteredGames={[games[0]]}
          onComplete={onComplete}
        />
      </I18nProvider>
    );

    // Switch preset from Missing Cover Artwork (1) to Entire Library (2)
    fireEvent.click(screen.getByRole("button", { name: /Entire Library/i }));
    fireEvent.click(screen.getByRole("button", { name: /Download Selected Data \(2\)/i }));

    // Modal closes immediately so the user is never blocked
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().metadataDownload).toMatchObject({
      status: "running",
      mode: "batch",
      current: 0,
      total: 2,
    });

    await waitFor(() => {
      expect(api.metadata.downloadBatchMetadata).toHaveBeenCalledWith(["g1", "g2"]);
    });

    // Reopening the modal while background download is active shows non-blocking status + Cancel
    rerender(
      <I18nProvider initialLocale="en">
        <BatchEnrichModal
          isOpen={true}
          onClose={onClose}
          allGames={games}
          filteredGames={[games[0]]}
          onComplete={onComplete}
        />
      </I18nProvider>
    );
    expect(screen.getByText(/already running in the background/i)).toBeTruthy();

    await act(async () => {
      await cancelBackgroundMetadataDownload();
    });
    expect(api.metadata.cancelMetadataDownload).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveDownload(1);
    });

    await waitFor(() => {
      expect(useUiStore.getState().metadataDownload?.status).toBe("cancelled");
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("reports IPC errors in background state and runs HLTB + store-eligible achievements when metadata is disabled", async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    vi.mocked(api.metadata.downloadBatchMetadata).mockRejectedValueOnce(new Error("Pipeline crashed"));

    render(
      <I18nProvider initialLocale="en">
        <BatchEnrichModal
          isOpen={true}
          onClose={onClose}
          allGames={games}
          filteredGames={games}
          onComplete={onComplete}
        />
      </I18nProvider>
    );

    // Select Entire Library (2), start download -> modal closes & error recorded in store
    fireEvent.click(screen.getByRole("button", { name: /Entire Library/i }));
    fireEvent.click(screen.getByRole("button", { name: /Download Selected Data \(2\)/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(useUiStore.getState().metadataDownload).toMatchObject({
        status: "error",
        error: "Pipeline crashed",
      });
    });

    // Disable metadata, leaving HLTB and Achievements active
    fireEvent.click(screen.getByRole("button", { name: /Game Info & Artwork/i }));
    fireEvent.click(screen.getByRole("button", { name: /Download Selected Data \(2\)/i }));

    await waitFor(() => {
      expect(api.games.refreshGameHowlongtobeat).toHaveBeenCalledTimes(2);
      expect(api.achievements.refreshGameAchievements).toHaveBeenCalledTimes(1);
      expect(api.achievements.refreshGameAchievements).toHaveBeenCalledWith("g1");
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(useUiStore.getState().metadataDownload?.status).toBe("completed");
    });
  });

  it("renders Radix Checkbox controls and toggles game selection", () => {
    render(
      <I18nProvider initialLocale="en">
        <BatchEnrichModal
          isOpen={true}
          onClose={vi.fn()}
          allGames={[games[0]]}
          filteredGames={[games[0]]}
          onComplete={vi.fn(async () => {})}
        />
      </I18nProvider>
    );

    const checkbox = screen.getByRole("checkbox", { name: "Hollow Knight" });
    expect(checkbox.getAttribute("data-state")).toBe("checked");
    fireEvent.click(checkbox);
    expect(checkbox.getAttribute("data-state")).toBe("unchecked");
  });

  it("applies max-height constraint to the game list scroll viewport so long lists can scroll", () => {
    render(
      <I18nProvider initialLocale="en">
        <BatchEnrichModal
          isOpen={true}
          onClose={vi.fn()}
          allGames={games}
          filteredGames={games}
          onComplete={vi.fn(async () => {})}
        />
      </I18nProvider>
    );

    const gameItem = screen.getByText("Hollow Knight");
    const viewport = gameItem.closest("[data-radix-scroll-area-viewport]");
    expect(viewport).not.toBeNull();
    expect(viewport?.className).toContain("max-h-[300px]");
  });
});
