import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import { I18nProvider } from "@/i18n";
import { DetailsHeroHeader } from "./details/DetailsHeroHeader";
import GridView from "./GridView";
import ListViewTable from "./ListViewTable";
import StatisticsDashboardView from "./StatisticsDashboardView";
import { api } from "@/api";
import type { GameDto, GlobalStatsDto } from "@/types";

vi.mock("@/api/slots", () => ({
  slotsApi: {
    getSlotWidgets: vi.fn().mockResolvedValue([]),
  },
}));

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const sampleGame = {
  id: "g1",
  title: "Hollow Knight",
  library: "steam",
  platform: "pc",
  playtime_formatted: "15h 20m",
  playtime_seconds: 55200,
  genres: ["Action", "Indie"],
  developers: ["Team Cherry"],
  publishers: ["Team Cherry"],
  features: ["Single-player"],
  custom_links: [],
  is_installed: true,
  is_favorite: false,
  is_hidden: false,
  completion_status: "Playing",
} as unknown as GameDto;

const sampleStats: GlobalStatsDto = {
  available_years: [2026, 2025],
  total_playtime_year_seconds: 36000,
  total_playtime_lifetime_seconds: 72000,
  activity_heatmap: [
    {
      date: "2026-01-15",
      duration_seconds: 3600,
      count_sessions: 1,
      sessions: [
        {
          id: "s1",
          game_id: "g1",
          game_title: "Hollow Knight",
          duration_seconds: 3600,
          started_at: "2026-01-15T18:00:00Z",
          ended_at: "2026-01-15T19:00:00Z",
        },
      ],
    },
  ],
  store_distribution: [{ name: "steam", duration_seconds: 36000, percentage: 100 }],
  genre_distribution: [{ name: "Indie", duration_seconds: 36000, percentage: 100 }],
  backlog_summary: {
    total_games: 10,
    completed_count: 3,
    in_progress_count: 2,
    not_played_count: 5,
    completion_percentage: 30,
  },
};

describe("Library & Dashboard Views", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders DetailsHeroHeader with DropdownMenu Manage button and action buttons", async () => {
    const handleLaunch = vi.fn();
    const handleToggleFavorite = vi.fn();

    render(
      <I18nProvider initialLocale="en">
        <DetailsHeroHeader
          selectedGame={sampleGame}
          setViewMode={vi.fn()}
          handleLaunch={handleLaunch}
          handleEnrichSingleGame={vi.fn()}
          isEnrichingSingle={false}
          setGameToEdit={vi.fn()}
          setShowEditorModal={vi.fn()}
          setGameToResolve={vi.fn()}
          setShowResolutionModal={vi.fn()}
          t={(key) => key}
          handleToggleFavorite={handleToggleFavorite}
          handleOpenInstallDir={vi.fn()}
        />
      </I18nProvider>
    );

    const manageTrigger = screen.getByRole("button", { name: /game_details\.manage/i });
    expect(manageTrigger.getAttribute("aria-haspopup")).toBe("menu");

    const launchBtn = screen.getByRole("button", { name: /game_details\.play_now/i });
    fireEvent.click(launchBtn);
    expect(handleLaunch).toHaveBeenCalledWith("g1");

    const favBtn = screen.getByRole("button", { name: "sidebar.add_favorite" });
    fireEvent.click(favBtn);
    expect(handleToggleFavorite).toHaveBeenCalledWith(sampleGame);

    await act(async () => {
      await Promise.resolve();
    });
  });

  it("renders StatisticsDashboardView with Select year combobox and KPI cards", async () => {
    vi.spyOn(api.stats, "getGlobalStatistics").mockResolvedValueOnce(sampleStats);

    render(
      <I18nProvider initialLocale="en">
        <StatisticsDashboardView />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeTruthy();
    });

    const yearSelect = screen.getByRole("combobox");
    expect(yearSelect.textContent).toContain("2026");
    expect(screen.getByText("30.0%")).toBeTruthy();
  });

  it("does not keep a persistent accent selection ring on GridView game cards for selectedGame", async () => {
    render(
      <I18nProvider initialLocale="en">
        <GridView
          filteredGames={[sampleGame]}
          groupedGames={{ All: [sampleGame] }}
          groupBy="none"
          collapsedGroups={{}}
          toggleGroup={vi.fn()}
          gridCardWidth={200}
          selectedGame={sampleGame}
          setSelectedGame={vi.fn()}
          setViewMode={vi.fn()}
          handleOpenContextMenu={vi.fn()}
          handleLaunch={vi.fn()}
          setGameToEdit={vi.fn()}
          setShowEditorModal={vi.fn()}
        />
      </I18nProvider>
    );

    const card = screen.getByRole("button", { name: "Hollow Knight" });
    expect(card.className).not.toContain("border-[var(--accent-primary)]");
    expect(card.className).not.toContain("ring-2 ring-[var(--accent-primary)]");

    await act(async () => {
      await Promise.resolve();
    });
  });

  it("renders ListViewTable using shadcn Table and triggers launch action", () => {
    const onLaunchGame = vi.fn();
    render(
      <I18nProvider initialLocale="en">
        <ListViewTable
          games={[sampleGame]}
          selectedGameId={null}
          onSelectGame={vi.fn()}
          onOpenDetails={vi.fn()}
          onLaunchGame={onLaunchGame}
          onEditGame={vi.fn()}
        />
      </I18nProvider>
    );

    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Hollow Knight")).toBeTruthy();
    const launchBtn = screen.getByRole("button", { name: /common\.play|Avvia|Play/i });
    fireEvent.click(launchBtn);
    expect(onLaunchGame).toHaveBeenCalledWith("g1");
  });
});
