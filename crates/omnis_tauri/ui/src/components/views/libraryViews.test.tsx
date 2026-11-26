import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import { I18nProvider } from "@/i18n";
import { DetailsHeroHeader } from "./details/DetailsHeroHeader";
import GridView from "./GridView";
import ListViewTable from "./ListViewTable";
import StatisticsDashboardView from "./StatisticsDashboardView";
import {
  DetailsSidebar,
  DETAILS_SIDEBAR_WIDTH_STORAGE_KEY,
  DEFAULT_DETAILS_SIDEBAR_WIDTH,
  MIN_DETAILS_SIDEBAR_WIDTH,
  MAX_DETAILS_SIDEBAR_WIDTH,
} from "./details/DetailsSidebar";
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
    const statsSpy = vi
      .spyOn(api.stats, "getGlobalStatistics")
      .mockResolvedValue(sampleStats);

    try {
      render(
        <I18nProvider initialLocale="en">
          <StatisticsDashboardView />
        </I18nProvider>
      );

      expect(await screen.findByText("30.0%")).toBeTruthy();
      const yearSelect = screen.getByRole("combobox");
      expect(yearSelect.textContent).toContain("2026");
    } finally {
      statsSpy.mockRestore();
    }
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

  it("scrolls selected game into view and marks it aria-selected in DetailsSidebar", async () => {
    const secondGame = { ...sampleGame, id: "g2", title: "Celeste" };
    const scrollIntoViewMock = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const originalRaf = globalThis.requestAnimationFrame;
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame;

    try {
      localStorage.clear();
      render(
        <I18nProvider initialLocale="en">
          <DetailsSidebar
            detailsSidebarOpen={true}
            setDetailsSidebarOpen={vi.fn()}
            detailsSearchQuery=""
            setDetailsSearchQuery={vi.fn()}
            detailsFilteredGames={[sampleGame, secondGame]}
            selectedGame={secondGame}
            setSelectedGame={vi.fn()}
            handleOpenContextMenu={vi.fn()}
            t={(key) => key}
          />
        </I18nProvider>
      );

      const selectedBtn = screen.getByRole("button", { name: /Celeste/i });
      expect(selectedBtn.getAttribute("aria-selected")).toBe("true");
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "center" });
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      globalThis.requestAnimationFrame = originalRaf;
    }
  });

  it("wraps long titles up to two lines and resizes/persists DetailsSidebar width", () => {
    localStorage.setItem(DETAILS_SIDEBAR_WIDTH_STORAGE_KEY, "380");
    const longTitleGame = {
      ...sampleGame,
      id: "g-long",
      title: "Ori and the Will of the Wisps Definitive Collector Edition",
    };

    const { rerender } = render(
      <I18nProvider initialLocale="en">
        <DetailsSidebar
          detailsSidebarOpen={true}
          setDetailsSidebarOpen={vi.fn()}
          detailsSearchQuery=""
          setDetailsSearchQuery={vi.fn()}
          detailsFilteredGames={[longTitleGame]}
          selectedGame={longTitleGame}
          setSelectedGame={vi.fn()}
          handleOpenContextMenu={vi.fn()}
          t={(key) => key}
        />
      </I18nProvider>
    );

    const sidebar = screen.getByTestId("details-sidebar");
    expect(sidebar.style.width).toBe("380px");

    const titleEl = screen.getByText(longTitleGame.title);
    expect(titleEl.className).toContain("line-clamp-2");
    expect(titleEl.className).not.toContain("truncate");

    const separator = screen.getByRole("separator", { name: "game_details.resize_sidebar" });
    expect(separator.getAttribute("aria-valuenow")).toBe("380");

    // Drag to increase width beyond max -> clamped to MAX_DETAILS_SIDEBAR_WIDTH
    fireEvent.mouseDown(separator, { button: 0, clientX: 380 });
    fireEvent.mouseMove(window, { clientX: 600 });
    fireEvent.mouseUp(window);

    expect(sidebar.style.width).toBe(`${MAX_DETAILS_SIDEBAR_WIDTH}px`);
    expect(localStorage.getItem(DETAILS_SIDEBAR_WIDTH_STORAGE_KEY)).toBe(
      String(MAX_DETAILS_SIDEBAR_WIDTH)
    );

    // ArrowLeft decreases width by 16px
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(sidebar.style.width).toBe(`${MAX_DETAILS_SIDEBAR_WIDTH - 16}px`);

    // Drag below min -> clamped to MIN_DETAILS_SIDEBAR_WIDTH
    fireEvent.mouseDown(separator, { button: 0, clientX: 400 });
    fireEvent.mouseMove(window, { clientX: 50 });
    fireEvent.mouseUp(window);
    expect(sidebar.style.width).toBe(`${MIN_DETAILS_SIDEBAR_WIDTH}px`);

    // Double click resets to default width
    fireEvent.doubleClick(separator);
    expect(sidebar.style.width).toBe(`${DEFAULT_DETAILS_SIDEBAR_WIDTH}px`);
    expect(localStorage.getItem(DETAILS_SIDEBAR_WIDTH_STORAGE_KEY)).toBe(
      String(DEFAULT_DETAILS_SIDEBAR_WIDTH)
    );

    // Collapsing hides resize handle and shrinks to 44px
    rerender(
      <I18nProvider initialLocale="en">
        <DetailsSidebar
          detailsSidebarOpen={false}
          setDetailsSidebarOpen={vi.fn()}
          detailsSearchQuery=""
          setDetailsSearchQuery={vi.fn()}
          detailsFilteredGames={[longTitleGame]}
          selectedGame={longTitleGame}
          setSelectedGame={vi.fn()}
          handleOpenContextMenu={vi.fn()}
          t={(key) => key}
        />
      </I18nProvider>
    );

    expect(sidebar.style.width).toBe("44px");
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("virtualizes large expanded groups in GridView when scroll viewport has height", async () => {
    const manyGames: GameDto[] = Array.from({ length: 160 }, (_, idx) => ({
      ...sampleGame,
      id: `g-${idx}`,
      title: `Grouped Game ${idx}`,
      library: "steam",
    }));

    const origClientHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientHeight"
    );
    const origClientWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientWidth"
    );
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 600,
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 900,
    });

    try {
      render(
        <I18nProvider initialLocale="en">
          <GridView
            filteredGames={manyGames}
            groupedGames={{ Steam: manyGames }}
            groupBy="library"
            collapsedGroups={{}}
            toggleGroup={vi.fn()}
            gridCardWidth={180}
            selectedGame={manyGames[0]}
            setSelectedGame={vi.fn()}
            setViewMode={vi.fn()}
            handleOpenContextMenu={vi.fn()}
            handleLaunch={vi.fn()}
            setGameToEdit={vi.fn()}
            setShowEditorModal={vi.fn()}
            activeGame={null}
            elapsedSeconds={0}
            formatDuration={(s) => `${s}s`}
            handleKillRunningGame={vi.fn()}
          />
        </I18nProvider>
      );

      await waitFor(() => {
        const cards = document.querySelectorAll('[data-omnis="game-card"]');
        expect(cards.length).toBeGreaterThan(0);
        expect(cards.length).toBeLessThan(manyGames.length);
      });
    } finally {
      if (origClientHeight) {
        Object.defineProperty(HTMLElement.prototype, "clientHeight", origClientHeight);
      }
      if (origClientWidth) {
        Object.defineProperty(HTMLElement.prototype, "clientWidth", origClientWidth);
      }
    }
  });

  it("virtualizes ListViewTable from the initial render when scroll viewport has height", () => {
    const manyGames: GameDto[] = Array.from({ length: 200 }, (_, idx) => ({
      ...sampleGame,
      id: `l-${idx}`,
      title: `List Game ${String(idx).padStart(3, "0")}`,
    }));

    const origClientHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientHeight"
    );
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 540,
    });

    try {
      render(
        <I18nProvider initialLocale="en">
          <ListViewTable
            games={manyGames}
            selectedGameId={null}
            onSelectGame={vi.fn()}
            onOpenDetails={vi.fn()}
            onLaunchGame={vi.fn()}
            onEditGame={vi.fn()}
          />
        </I18nProvider>
      );

      const rows = document.querySelectorAll("tbody tr");
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThan(manyGames.length);
    } finally {
      if (origClientHeight) {
        Object.defineProperty(HTMLElement.prototype, "clientHeight", origClientHeight);
      }
    }
  });
});
