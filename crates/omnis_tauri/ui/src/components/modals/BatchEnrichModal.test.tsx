import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import BatchEnrichModal from "./BatchEnrichModal";
import { I18nProvider } from "@/i18n";
import { api } from "@/api";
import { TAURI_EVENTS, type GameDto } from "@/types";

let progressListener: ((event: { payload: { current: number; total: number; title: string } }) => void) | null = null;
const unlistenMock = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    async (
      event: string,
      cb: (payload: { payload: { current: number; total: number; title: string } }) => void
    ) => {
      if (event === TAURI_EVENTS.METADATA_PROGRESS) {
        progressListener = cb;
      }
      return unlistenMock;
    }
  ),
}));

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

describe("BatchEnrichModal IPC flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    progressListener = null;
  });

  it("runs batch metadata download with live progress and supports cancellation", async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    let resolveDownload!: (updated: number) => void;
    vi.mocked(api.metadata.downloadBatchMetadata).mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          resolveDownload = resolve;
        })
    );

    render(
      <I18nProvider initialLocale="en">
        <BatchEnrichModal
          isOpen={true}
          onClose={vi.fn()}
          allGames={games}
          filteredGames={[games[0]]}
          onComplete={onComplete}
        />
      </I18nProvider>
    );

    // Switch preset from Missing Cover Artwork (1) to Entire Library (2)
    fireEvent.click(screen.getByRole("button", { name: /Entire Library/i }));
    fireEvent.click(screen.getByRole("button", { name: /Download Selected Data \(2\)/i }));

    await waitFor(() => {
      expect(api.metadata.downloadBatchMetadata).toHaveBeenCalledWith(["g1", "g2"]);
      expect(progressListener).not.toBeNull();
    });

    act(() => {
      progressListener?.({ payload: { current: 1, total: 2, title: "Enriching Hollow Knight" } });
    });
    expect(screen.getByText("Enriching Hollow Knight")).toBeTruthy();
    expect(screen.getByText("1 / 2 (50%)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(api.metadata.cancelMetadataDownload).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveDownload(2);
    });

    await waitFor(() => {
      expect(screen.getByText("Cancellation request sent...")).toBeTruthy();
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("skips metadata download when disabled, runs HLTB + store-eligible achievements, and handles IPC error", async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.metadata.downloadBatchMetadata).mockRejectedValueOnce(new Error("Pipeline crashed"));

    render(
      <I18nProvider initialLocale="en">
        <BatchEnrichModal
          isOpen={true}
          onClose={vi.fn()}
          allGames={games}
          filteredGames={games}
          onComplete={onComplete}
        />
      </I18nProvider>
    );

    // Select Entire Library (2), then verify IPC error reporting
    fireEvent.click(screen.getByRole("button", { name: /Entire Library/i }));
    fireEvent.click(screen.getByRole("button", { name: /Download Selected Data \(2\)/i }));
    await waitFor(() => {
      expect(screen.getByText("Error during data download: Pipeline crashed")).toBeTruthy();
    });

    // Disable metadata, leaving HLTB and Achievements active
    fireEvent.click(screen.getByRole("button", { name: /Game Info & Artwork/i }));
    fireEvent.click(screen.getByRole("button", { name: /Download Selected Data \(2\)/i }));

    await waitFor(() => {
      expect(api.games.refreshGameHowlongtobeat).toHaveBeenCalledTimes(2);
      expect(api.achievements.refreshGameAchievements).toHaveBeenCalledTimes(1);
      expect(api.achievements.refreshGameAchievements).toHaveBeenCalledWith("g1");
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });
});
