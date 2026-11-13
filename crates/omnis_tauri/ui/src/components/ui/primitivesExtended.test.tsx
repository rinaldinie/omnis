import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { I18nProvider } from "@/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import GlobalContextMenu from "@/components/GlobalContextMenu";
import { DetailsHeroHeader } from "@/components/views/details/DetailsHeroHeader";
import GridView from "@/components/views/GridView";
import StatisticsDashboardView from "@/components/views/StatisticsDashboardView";
import { api } from "@/api";
import type { GameDto, GlobalStatsDto } from "@/types";

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

describe("Extended UI primitives & migrated views", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Select, Slider, RadioGroup, Textarea, Progress and Card", () => {
    const onSliderChange = vi.fn();
    const onRadioChange = vi.fn();
    const onTextChange = vi.fn();

    render(
      <div className="space-y-4">
        <Select defaultValue="steam">
          <SelectTrigger aria-label="Store selector">
            <SelectValue placeholder="Choose store" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="steam">Steam</SelectItem>
            <SelectItem value="gog">GOG</SelectItem>
          </SelectContent>
        </Select>

        <Slider
          min={10}
          max={100}
          step={10}
          value={[40]}
          onValueChange={onSliderChange}
          aria-label="Zoom slider"
        />

        <RadioGroup defaultValue="sessions" onValueChange={onRadioChange} aria-label="Reset scope">
          <RadioGroupItem value="sessions" aria-label="Sessions only" />
          <RadioGroupItem value="all" aria-label="All data" />
        </RadioGroup>

        <Textarea placeholder="Game synopsis" onChange={onTextChange} />

        <Progress value={65} aria-label="Sync progress" />

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>Overview</CardDescription>
          </CardHeader>
          <CardContent>Details body</CardContent>
          <CardFooter>Footer</CardFooter>
        </Card>
      </div>
    );

    const combobox = screen.getByRole("combobox", { name: "Store selector" });
    expect(combobox.textContent).toContain("Steam");

    const slider = screen.getByRole("slider");
    expect(slider.getAttribute("aria-valuenow")).toBe("40");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onSliderChange).toHaveBeenCalledWith([50]);

    const radioAll = screen.getByRole("radio", { name: "All data" });
    fireEvent.click(radioAll);
    expect(onRadioChange).toHaveBeenCalledWith("all");

    const textarea = screen.getByPlaceholderText("Game synopsis") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Bug-themed metroidvania" } });
    expect(onTextChange).toHaveBeenCalled();
    expect(textarea.value).toBe("Bug-themed metroidvania");

    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByText("Summary")).toBeTruthy();
    expect(screen.getByText("Details body")).toBeTruthy();
  });

  it("renders GlobalContextMenu with ARIA menu roles and Escape handling", () => {
    const onClose = vi.fn();
    const onLaunch = vi.fn();

    render(
      <I18nProvider initialLocale="en">
        <GlobalContextMenu
          contextMenu={{ x: 100, y: 120, game: sampleGame }}
          onClose={onClose}
          onLaunch={onLaunch}
          onEdit={vi.fn()}
          onResolve={vi.fn()}
          onShowDetails={vi.fn()}
          onUpdateCompletionStatus={vi.fn()}
        />
      </I18nProvider>
    );

    const menu = screen.getByRole("menu", { name: "Hollow Knight" });
    expect(menu).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    const items = screen.getAllByRole("menuitem");
    expect(items.length).toBeGreaterThan(3);
    fireEvent.click(items[0]);
    expect(onLaunch).toHaveBeenCalledWith("g1");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders DetailsHeroHeader with DropdownMenu Manage button and action buttons", () => {
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

    const favBtn = screen.getByTitle("sidebar.add_favorite");
    fireEvent.click(favBtn);
    expect(handleToggleFavorite).toHaveBeenCalledWith(sampleGame);
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

  it("does not keep a persistent accent selection ring on GridView game cards for selectedGame", () => {
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
  });
});
