import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GameAchievementsGallery } from "./GameAchievementsGallery";
import { I18nProvider } from "@/i18n";
import { api } from "@/api";
import type { GameDto } from "@/types";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      achievements: {
        ...actual.api.achievements,
        getGameAchievements: vi.fn(),
        refreshGameAchievements: vi.fn(),
      },
    },
  };
});

const steamGame: GameDto = {
  id: "g1",
  external_id: "400",
  title: "Portal",
  library: "steam",
  playtime_seconds: 600,
  playtime_formatted: "10m",
  critic_score: null,
  release_date: null,
  description: null,
  cover_image: null,
  background_image: null,
  is_installed: true,
  is_favorite: false,
  is_hidden: false,
  genres: [],
  developers: [],
  publishers: [],
  features: [],
  custom_links: [],
};

describe("GameAchievementsGallery sync_status states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signals confirmed no-achievements state and allows manual recheck", async () => {
    vi.mocked(api.achievements.getGameAchievements).mockResolvedValueOnce({
      game_id: "g1",
      total_count: 0,
      unlocked_count: 0,
      completion_percentage: 0,
      total_points: 0,
      earned_points: 0,
      sync_status: "none",
      achievements: [],
    });
    vi.mocked(api.achievements.refreshGameAchievements).mockResolvedValueOnce({
      game_id: "g1",
      total_count: 0,
      unlocked_count: 0,
      completion_percentage: 0,
      total_points: 0,
      earned_points: 0,
      sync_status: "none",
      achievements: [],
    });

    render(
      <I18nProvider initialLocale="en">
        <GameAchievementsGallery game={steamGame} />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText("This game has no achievements or trophies on STEAM.")
      ).toBeTruthy();
    });
    expect(
      screen.getByText("Already verified: future automatic scans will be skipped.")
    ).toBeTruthy();

    const recheckBtn = screen.getByRole("button", { name: /Recheck/i });
    fireEvent.click(recheckBtn);

    await waitFor(() => {
      expect(api.achievements.refreshGameAchievements).toHaveBeenCalledWith("g1");
    });
  });

  it("shows standard unsynced message when sync_status is unknown", async () => {
    vi.mocked(api.achievements.getGameAchievements).mockResolvedValueOnce({
      game_id: "g1",
      total_count: 0,
      unlocked_count: 0,
      completion_percentage: 0,
      total_points: 0,
      earned_points: 0,
      sync_status: "unknown",
      achievements: [],
    });

    render(
      <I18nProvider initialLocale="en">
        <GameAchievementsGallery game={steamGame} />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText("No achievements recorded or synced for this game on STEAM.")
      ).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /^Sync$/i })).toBeTruthy();
  });
});
