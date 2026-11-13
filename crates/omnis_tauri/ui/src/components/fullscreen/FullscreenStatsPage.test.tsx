import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import { FullscreenStatsPage } from "./FullscreenStatsPage";
import { FullscreenQuickMenu } from "./FullscreenQuickMenu";
import { FullscreenDetailsOverlay } from "./FullscreenDetailsOverlay";
import { FullscreenAchievementsPage } from "./FullscreenAchievementsPage";
import { FullscreenPowerDialog } from "./FullscreenPowerDialog";
import { FullscreenTopBar } from "./FullscreenTopBar";
import { FullscreenHomeContent } from "./FullscreenHomeContent";
import { ControllerLegend } from "./ConsoleChrome";
import { VideoBackdrop } from "../common/VideoBackdrop";
import { useGamepadNavigation } from "../../hooks/useGamepadNavigation";
import { BACK_PRIORITY, useBackHandler } from "../../hooks/useBackHandler";
import { getVisibleCategories } from "../../utils/consoleCategories";
import { api } from "../../api";
import type { GameDto, GlobalStatsDto, ThemeConfig } from "../../types";

const mockStats: GlobalStatsDto = {
  available_years: [2025, 2026],
  total_playtime_year_seconds: 18000,
  total_playtime_lifetime_seconds: 54000,
  activity_heatmap: [
    {
      date: "2026-02-14",
      duration_seconds: 7200,
      count_sessions: 2,
      sessions: [],
    },
  ],
  store_distribution: [{ name: "steam", duration_seconds: 18000, percentage: 100 }],
  genre_distribution: [{ name: "Action", duration_seconds: 18000, percentage: 100 }],
  backlog_summary: {
    total_games: 10,
    completed_count: 4,
    in_progress_count: 3,
    not_played_count: 3,
    completion_percentage: 40,
  },
};

const sampleGames = [
  {
    id: "g1",
    title: "Hollow Knight",
    library: "steam",
    playtime_seconds: 36000,
    playtime_formatted: "10h",
    genres: ["Action"],
    developers: ["Team Cherry"],
    publishers: ["Team Cherry"],
    background_image: "https://example.com/bg.jpg",
    cover_image: "https://example.com/cover.jpg",
  },
] as unknown as GameDto[];

const testTheme = {
  id: "test",
  name: "Test",
  bg_base: "#090c14",
  bg_surface: "#0e1320",
  bg_card: "#141a2c",
  text_primary: "#ffffff",
  text_muted: "#94a3b8",
  accent_primary: "#6366f1",
  accent_glow: "rgba(99,102,241,0.4)",
  border_color: "#1e293b",
  card_radius: "12px",
  font_family: "sans-serif",
  enable_video_backdrop: false,
} as unknown as ThemeConfig;

describe("FullscreenStatsPage & Console Back Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders compact dashboard, supports year switching, and closes cleanly via capture Esc/Backspace", async () => {
    const getStatsSpy = vi.spyOn(api.stats, "getGlobalStatistics").mockResolvedValue(mockStats);
    const onClose = vi.fn();
    const currentYear = new Date().getUTCFullYear();

    render(
      <FullscreenStatsPage
        isOpen={true}
        games={sampleGames}
        locale="en"
        onClose={onClose}
        t={(key) => key}
      />
    );

    await waitFor(() => {
      expect(getStatsSpy).toHaveBeenCalledWith({ year: currentYear });
    });
    expect(await screen.findByText("Hollow Knight")).toBeTruthy();

    // Switching year via LB button or bumper event fetches the previous year
    fireEvent.click(screen.getByRole("button", { name: "Previous year" }));
    await waitFor(() => {
      expect(getStatsSpy).toHaveBeenCalledWith({ year: 2025 });
    });

    act(() => {
      window.dispatchEvent(new CustomEvent("omnis:page-bumper", { detail: { direction: 1 } }));
    });
    await waitFor(() => {
      expect(getStatsSpy).toHaveBeenCalledWith({ year: 2026 });
    });

    // Top-left header Back button was removed in favor of ESC / Controller B / bottom legend
    expect(screen.queryByRole("button", { name: "console_ui.back" })).toBeNull();

    // Escape and Backspace close via capture-phase handler even if inner elements stop propagation
    const headingEl = screen.getByText("console_ui.statistics");
    fireEvent.keyDown(headingEl, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes console stats page via useGamepadNavigation Escape, Backspace, and ControllerLegend Back pill", async () => {
    vi.spyOn(api.stats, "getGlobalStatistics").mockResolvedValue(mockStats);

    function Harness() {
      const { consolePage, setConsolePage } = useGamepadNavigation({
        isFullscreen: true,
        toggleFullscreen: vi.fn(),
        filteredGames: sampleGames,
        selectedGame: sampleGames[0],
        showVirtualKeyboard: false,
        setShowVirtualKeyboard: vi.fn(),
        setShowThemeModal: vi.fn(),
        handleLaunch: vi.fn(),
        cycleFilter: vi.fn(),
      });

      return (
        <div>
          <button type="button" onClick={() => setConsolePage("stats")}>
            Open Stats
          </button>
          <span data-testid="page-state">{consolePage ?? "home"}</span>
          <FullscreenStatsPage
            isOpen={consolePage === "stats"}
            games={sampleGames}
            locale="en"
            onClose={() => setConsolePage(null)}
            t={(key) => key}
          />
          {consolePage === "stats" && (
            <ControllerLegend
              left={[{ kind: "menu", label: "Menu" }]}
              right={[{ kind: "b", label: "Back", onClick: () => setConsolePage(null) }]}
            />
          )}
        </div>
      );
    }

    render(<Harness />);

    // Open -> close with Escape
    fireEvent.click(screen.getByText("Open Stats"));
    expect(screen.getByTestId("page-state").textContent).toBe("stats");
    await screen.findByText("Hollow Knight");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("page-state").textContent).toBe("home");

    // Reopen -> close with Backspace
    fireEvent.click(screen.getByText("Open Stats"));
    expect(screen.getByTestId("page-state").textContent).toBe("stats");
    await screen.findByText("Hollow Knight");
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(screen.getByTestId("page-state").textContent).toBe("home");

    // Reopen -> close via ControllerLegend Back pill
    fireEvent.click(screen.getByText("Open Stats"));
    expect(screen.getByTestId("page-state").textContent).toBe("stats");
    await screen.findByText("Hollow Knight");
    fireEvent.click(screen.getByRole("button", { name: /^Esc\s*Back$/i }));
    expect(screen.getByTestId("page-state").textContent).toBe("home");
  });

  it("renders crisp uncropped hero backdrop with object-contain when requested", () => {
    render(
      <VideoBackdrop
        game={sampleGames[0]}
        theme={testTheme}
        blurLevel="none"
        gradientOverlay="hero"
        imageFit="contain"
        objectPosition="right top"
      />
    );

    const img = screen.getByAltText("Hollow Knight");
    expect(img.className).toContain("object-contain");
    expect(img.className).toContain("filter-none");
    expect(img.className).toContain("scale-100");
    expect(img.className).not.toContain("object-cover");
    expect(img.parentElement?.className).toContain("items-center");
  });

  it("closes FullscreenQuickMenu on Escape even when details overlay was also open", () => {
    function MenuHarness() {
      const {
        isMenuOpen,
        setIsMenuOpen,
        showFullscreenDetails,
        setShowFullscreenDetails,
      } = useGamepadNavigation({
        isFullscreen: true,
        toggleFullscreen: vi.fn(),
        filteredGames: sampleGames,
        selectedGame: sampleGames[0],
        showVirtualKeyboard: false,
        setShowVirtualKeyboard: vi.fn(),
        setShowThemeModal: vi.fn(),
        handleLaunch: vi.fn(),
        cycleFilter: vi.fn(),
      });

      return (
        <div>
          <button
            type="button"
            onClick={() => {
              setShowFullscreenDetails(true);
              setIsMenuOpen(true);
            }}
          >
            Open Both
          </button>
          <span data-testid="menu-state">{isMenuOpen ? "open" : "closed"}</span>
          <span data-testid="details-state">{showFullscreenDetails ? "open" : "closed"}</span>
          <FullscreenQuickMenu
            isMenuOpen={isMenuOpen}
            onClose={() => setIsMenuOpen(false)}
            clock="21:30"
            menuItems={[]}
            safeMenuIndex={0}
            setMenuFocusedIndex={vi.fn()}
            soundEffects={{ playSelect: vi.fn() }}
            t={(k) => k}
            menuSectionLabelKeys={{}}
            menuItemRefs={{ current: {} }}
          />
        </div>
      );
    }

    render(<MenuHarness />);
    fireEvent.click(screen.getByText("Open Both"));
    expect(screen.getByTestId("menu-state").textContent).toBe("open");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("menu-state").textContent).toBe("closed");
    expect(screen.getByTestId("details-state").textContent).toBe("open");
  });

  it("closes higher-priority PowerDialog before FullscreenQuickMenu on capture-phase Escape without hasModalChild", () => {
    const onCloseMenu = vi.fn();
    const onClosePower = vi.fn();
    const { rerender } = render(
      <div onKeyDown={(e) => e.stopPropagation()}>
        <button data-testid="inner-btn">Focused</button>
        <FullscreenQuickMenu
          isMenuOpen={true}
          onClose={onCloseMenu}
          clock="21:30"
          menuItems={[]}
          safeMenuIndex={0}
          setMenuFocusedIndex={vi.fn()}
          soundEffects={{ playSelect: vi.fn() }}
          t={(k) => k}
          menuSectionLabelKeys={{}}
          menuItemRefs={{ current: {} }}
        />
        <FullscreenPowerDialog
          isOpen={true}
          onClose={onClosePower}
          onSelectAction={vi.fn()}
          soundEffects={{ playSelect: vi.fn(), playNav: vi.fn() }}
          t={(k) => k}
        />
      </div>
    );

    const innerBtn = screen.getByTestId("inner-btn");
    fireEvent.keyDown(innerBtn, { key: "Escape" });
    expect(onClosePower).toHaveBeenCalledTimes(1);
    expect(onCloseMenu).not.toHaveBeenCalled();

    rerender(
      <div onKeyDown={(e) => e.stopPropagation()}>
        <button data-testid="inner-btn">Focused</button>
        <FullscreenQuickMenu
          isMenuOpen={true}
          onClose={onCloseMenu}
          clock="21:30"
          menuItems={[]}
          safeMenuIndex={0}
          setMenuFocusedIndex={vi.fn()}
          soundEffects={{ playSelect: vi.fn() }}
          t={(k) => k}
          menuSectionLabelKeys={{}}
          menuItemRefs={{ current: {} }}
        />
        <FullscreenPowerDialog
          isOpen={false}
          onClose={onClosePower}
          onSelectAction={vi.fn()}
          soundEffects={{ playSelect: vi.fn(), playNav: vi.fn() }}
          t={(k) => k}
        />
      </div>
    );

    fireEvent.keyDown(innerBtn, { key: "Escape" });
    expect(onCloseMenu).toHaveBeenCalledTimes(1);
  });

  it("unwinds Confirm > Power > Page > Menu > Details > HomeZone in priority order and ignores VirtualKeyboard", () => {
    function StackHarness() {
      const [vkOpen, setVkOpen] = React.useState(true);
      const [confirmOpen, setConfirmOpen] = React.useState(true);
      const [powerOpen, setPowerOpen] = React.useState(true);
      const [pageOpen, setPageOpen] = React.useState(true);
      const [menuOpen, setMenuOpen] = React.useState(true);
      const [detailsOpen, setDetailsOpen] = React.useState(true);
      const [zoneActive, setZoneActive] = React.useState(true);

      useBackHandler(confirmOpen, () => setConfirmOpen(false), BACK_PRIORITY.CONFIRM_DIALOG);
      useBackHandler(zoneActive, () => setZoneActive(false), BACK_PRIORITY.HOME_ZONE);

      return (
        <div>
          <span data-testid="stack-state">
            {[confirmOpen, powerOpen, pageOpen, menuOpen, detailsOpen, zoneActive].map((v) => (v ? "1" : "0")).join("")}
          </span>
          {vkOpen && <div data-virtual-keyboard="true">VK</div>}
          <button data-testid="close-vk" onClick={() => setVkOpen(false)} />
          <FullscreenPowerDialog
            isOpen={powerOpen}
            onClose={() => setPowerOpen(false)}
            onSelectAction={vi.fn()}
            soundEffects={{ playSelect: vi.fn(), playNav: vi.fn() }}
            t={(k) => k}
          />
          <FullscreenStatsPage
            isOpen={pageOpen}
            games={sampleGames}
            locale="en-US"
            onClose={() => setPageOpen(false)}
            t={(k) => k}
          />
          <FullscreenQuickMenu
            isMenuOpen={menuOpen}
            onClose={() => setMenuOpen(false)}
            clock="21:30"
            menuItems={[]}
            safeMenuIndex={0}
            setMenuFocusedIndex={vi.fn()}
            soundEffects={{ playSelect: vi.fn() }}
            t={(k) => k}
            menuSectionLabelKeys={{}}
            menuItemRefs={{ current: {} }}
          />
          <FullscreenDetailsOverlay
            showFullscreenDetails={detailsOpen}
            activeDetailGame={sampleGames[0]}
            detailsScrollRef={{ current: null }}
            isFocusedGameRunning={false}
            duration={(s) => `${s}s`}
            handleLaunch={vi.fn()}
            setShowFullscreenDetails={setDetailsOpen}
            detailsFocusedSection="hero"
            heroFocusedButton="launch"
            heroButtons={["launch"]}
            heroActions={{}}
            openConfirm={vi.fn()}
            setNotice={vi.fn()}
            soundEffects={{ playSelect: vi.fn() }}
            playtimeLabel={() => "1h"}
            achievementsSupported={false}
            achievementsSummary={null}
            achievementsLoading={false}
            achievementsCardRef={{ current: null }}
            onOpenAchievements={vi.fn()}
            storeLabels={{ steam: "Steam" }}
            renderStoreIcon={() => <span />}
            t={(k) => k}
          />
        </div>
      );
    }

    render(<StackHarness />);
    expect(screen.getByTestId("stack-state").textContent).toBe("111111");

    // While VirtualKeyboard is mounted, Escape and Backspace must not pop layers
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(screen.getByTestId("stack-state").textContent).toBe("111111");

    fireEvent.click(screen.getByTestId("close-vk"));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("stack-state").textContent).toBe("011111");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("stack-state").textContent).toBe("001111");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("stack-state").textContent).toBe("000111");

    fireEvent.keyDown(window, { key: "Backspace" });
    expect(screen.getByTestId("stack-state").textContent).toBe("000011");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("stack-state").textContent).toBe("000001");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("stack-state").textContent).toBe("000000");
  });

  it("renders all top bar filter and store tabs as icon-only pills and excludes genre filters", () => {
    const visible = getVisibleCategories(
      {
        total: 10,
        installed: 4,
        recent: 2,
        favorites: 1,
        steam: 5,
        gog: 3,
        epic: 2,
        xbox: 0,
        switch: 0,
        hidden: 0,
        action: 8,
        rpg: 4,
        strategy: 2,
        indie: 3,
      },
      "all"
    );
    expect(visible).toEqual(["all", "installed", "recent", "favorites", "steam", "gog", "epic"]);

    const setActiveFilter = vi.fn();
    const setFocusedIndex = vi.fn();
    render(
      <FullscreenTopBar
        visibleFilters={visible}
        activeCategory="steam"
        filterLabel={(id) =>
          ({
            all: "All Games",
            installed: "Installed",
            recent: "Recent",
            favorites: "Favorites",
            steam: "Steam",
            gog: "GOG",
            epic: "Epic Games",
          }[id] ?? id)
        }
        filterCount={(id) =>
          ({ all: 10, installed: 4, recent: 2, favorites: 1, steam: 5, gog: 3, epic: 2 }[id] ?? 0)
        }
        homeFocusZone="carousel"
        setActiveFilter={setActiveFilter}
        setFocusedIndex={setFocusedIndex}
        cycleFilter={vi.fn()}
        tabRefs={{ current: {} }}
        actualElapsed={0}
        hasUpdate={false}
        searchQuery=""
        clock="21:30"
        gamepadConnected={false}
        t={(k) => k}
      />
    );

    const allTab = screen.getByRole("button", { name: "All Games" });
    expect(allTab.textContent).toBe("");
    expect(allTab.getAttribute("title")).toBe("All Games (10)");

    const favoritesTab = screen.getByRole("button", { name: "Favorites" });
    expect(favoritesTab.textContent).toBe("");
    expect(favoritesTab.getAttribute("title")).toBe("Favorites (1)");

    const steamTab = screen.getByRole("button", { name: "Steam" });
    expect(steamTab.textContent).toBe("");
    expect(steamTab.getAttribute("title")).toBe("Steam (5)");

    const gogTab = screen.getByRole("button", { name: "GOG" });
    expect(gogTab.textContent).toBe("");
    fireEvent.click(gogTab);
    expect(setActiveFilter).toHaveBeenCalledWith("gog");
  });

  it("renders FullscreenDetailsOverlay without Back button and closes on Escape", () => {
    const setShowFullscreenDetails = vi.fn();
    render(
      <FullscreenDetailsOverlay
        showFullscreenDetails={true}
        activeDetailGame={sampleGames[0]}
        detailsScrollRef={{ current: null }}
        isFocusedGameRunning={false}
        duration={(s) => `${s}s`}
        handleLaunch={vi.fn()}
        setShowFullscreenDetails={setShowFullscreenDetails}
        detailsFocusedSection="hero"
        heroFocusedButton="launch"
        heroButtons={["launch"]}
        heroActions={{}}
        openConfirm={vi.fn()}
        setNotice={vi.fn()}
        soundEffects={{ playSelect: vi.fn() }}
        playtimeLabel={() => "1h"}
        achievementsSupported={false}
        achievementsSummary={null}
        achievementsLoading={false}
        achievementsCardRef={{ current: null }}
        onOpenAchievements={vi.fn()}
        storeLabels={{ steam: "Steam" }}
        renderStoreIcon={() => <span />}
        t={(k) => k}
      />
    );

    expect(screen.queryByRole("button", { name: "console_ui.back" })).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(setShowFullscreenDetails).toHaveBeenCalledWith(false);
  });

  it("closes topmost overlay/menu/details/page cleanly via Gamepad B button", () => {
    let gamepadB = false;
    const origGetGamepads = navigator.getGamepads;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [
        {
          connected: true,
          id: "Xbox Controller",
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 18 }, (_, i) => ({
            pressed: i === 1 ? gamepadB : false,
            value: i === 1 && gamepadB ? 1 : 0,
            touched: false,
          })),
        },
      ],
    });

    const rafCallbacks: FrameRequestCallback[] = [];
    const origRaf = window.requestAnimationFrame;
    const origCancelRaf = window.cancelAnimationFrame;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = vi.fn();

    function GamepadHarness() {
      const [powerOpen, setPowerOpen] = React.useState(true);
      const {
        showFullscreenDetails,
        setShowFullscreenDetails,
        isMenuOpen,
        setIsMenuOpen,
      } = useGamepadNavigation({
        isFullscreen: true,
        toggleFullscreen: vi.fn(),
        filteredGames: sampleGames,
        selectedGame: sampleGames[0],
        showVirtualKeyboard: false,
        setShowVirtualKeyboard: vi.fn(),
        setShowThemeModal: vi.fn(),
        handleLaunch: vi.fn(),
        cycleFilter: vi.fn(),
      });

      React.useEffect(() => {
        setShowFullscreenDetails(true);
        setIsMenuOpen(true);
      }, [setShowFullscreenDetails, setIsMenuOpen]);

      return (
        <div>
          <span data-testid="power">{powerOpen ? "open" : "closed"}</span>
          <span data-testid="menu">{isMenuOpen ? "open" : "closed"}</span>
          <span data-testid="details">{showFullscreenDetails ? "open" : "closed"}</span>
          <FullscreenPowerDialog
            isOpen={powerOpen}
            onClose={() => setPowerOpen(false)}
            onSelectAction={vi.fn()}
            soundEffects={{ playSelect: vi.fn(), playNav: vi.fn() }}
            t={(k) => k}
          />
        </div>
      );
    }

    try {
      render(<GamepadHarness />);
      const tick = (pressB: boolean) => {
        gamepadB = pressB;
        const cb = rafCallbacks.pop();
        if (cb) act(() => cb(performance.now()));
      };

      // Neutral frame -> press B closes PowerDialog first
      tick(false);
      tick(true);
      expect(screen.getByTestId("power").textContent).toBe("closed");
      expect(screen.getByTestId("menu").textContent).toBe("open");
      expect(screen.getByTestId("details").textContent).toBe("open");

      // Release -> press B closes Menu BEFORE Details underneath
      tick(false);
      tick(true);
      expect(screen.getByTestId("menu").textContent).toBe("closed");
      expect(screen.getByTestId("details").textContent).toBe("open");

      // Release -> press B closes Details
      tick(false);
      tick(true);
      expect(screen.getByTestId("details").textContent).toBe("closed");
    } finally {
      Object.defineProperty(navigator, "getGamepads", { configurable: true, value: origGetGamepads });
      window.requestAnimationFrame = origRaf;
      window.cancelAnimationFrame = origCancelRaf;
    }
  });

  it("renders clickable ControllerLegend entries without a pill border box", () => {
    const onMenu = vi.fn();
    render(
      <ControllerLegend
        left={[{ kind: "menu", label: "Menu", onClick: onMenu }]}
        right={[{ kind: "a", label: "Play" }]}
      />
    );

    const menuBtn = screen.getByRole("button", { name: /Menu/i });
    expect(menuBtn.className).toContain("bg-transparent");
    expect(menuBtn.className).toContain("border-none");
    fireEvent.click(menuBtn);
    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  it("navigates and scrolls grid rows via ArrowDown / PageDown and suppresses focus ring outside carousel", () => {
    const gridGames = Array.from({ length: 8 }, (_, idx) => ({
      ...sampleGames[0],
      id: `grid-game-${idx}`,
      title: `Grid Game ${idx}`,
    })) as GameDto[];

    function GridHarness() {
      const gridRef = React.useRef<HTMLDivElement>(null);
      const carouselRef = React.useRef<HTMLDivElement>(null);
      const { focusedIndex, setFocusedIndex, homeFocusZone, setHomeFocusZone } = useGamepadNavigation({
        isFullscreen: true,
        toggleFullscreen: vi.fn(),
        filteredGames: gridGames,
        selectedGame: gridGames[0],
        showVirtualKeyboard: false,
        setShowVirtualKeyboard: vi.fn(),
        setShowThemeModal: vi.fn(),
        handleLaunch: vi.fn(),
        cycleFilter: vi.fn(),
        fullscreenGridColumns: 3,
      });

      React.useEffect(() => {
        const card = gridRef.current?.children[focusedIndex] as HTMLElement | undefined;
        card?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }, [focusedIndex]);

      return (
        <div>
          <span data-testid="grid-focus">{`${focusedIndex}:${homeFocusZone}`}</span>
          <button data-testid="zone-topbar" onClick={() => setHomeFocusZone("topbar")} />
          <FullscreenHomeContent
            filteredGames={gridGames}
            layout="grid"
            searchQuery=""
            showRecentRow={false}
            recentGames={[]}
            safeRecentIndex={0}
            setRecentIndex={vi.fn()}
            homeFocusZone={homeFocusZone}
            setHomeFocusZone={setHomeFocusZone}
            focusedIndex={focusedIndex}
            setFocusedIndex={setFocusedIndex}
            setShowFullscreenDetails={vi.fn()}
            handleLaunch={vi.fn()}
            activeCategory="all"
            filterLabel={(id) => id}
            carouselRef={carouselRef}
            gridRef={gridRef}
            gridColumns={3}
            actualElapsed={0}
            playtimeLabel={() => "1h"}
            infoGame={gridGames[focusedIndex]}
            t={(k) => k}
          />
        </div>
      );
    }

    const { container } = render(<GridHarness />);
    expect(screen.getByTestId("grid-focus").textContent).toBe("0:carousel");
    expect(container.querySelector('[data-omnis="fullscreen.hero"]')).toBeNull();

    // ArrowDown moves down one full grid row (0 -> 3) and scrolls card into view
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByTestId("grid-focus").textContent).toBe("3:carousel");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    // PageDown jumps multiple rows clamped to last item
    fireEvent.keyDown(window, { key: "PageDown" });
    expect(screen.getByTestId("grid-focus").textContent).toBe("7:carousel");

    // ArrowUp moves back up one row (7 -> 4)
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByTestId("grid-focus").textContent).toBe("4:carousel");

    // Topbar focus clears active GridCard highlight until returning to grid
    fireEvent.click(screen.getByTestId("zone-topbar"));
    expect(screen.getByTestId("grid-focus").textContent).toBe("4:topbar");
  });

  it("renders FullscreenAchievementsPage without top-right BACK button and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <FullscreenAchievementsPage
        isOpen={true}
        game={sampleGames[0]}
        summary={null}
        loading={false}
        onClose={onClose}
        locale="en"
        t={(k) => k}
      />
    );

    expect(screen.queryByRole("button", { name: "console_ui.back" })).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
