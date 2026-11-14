import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import { FullscreenQuickMenu } from "./FullscreenQuickMenu";
import { useFullscreenMenu, UseFullscreenMenuOptions } from "./useFullscreenMenu";
import { MENU_SECTION_LABEL_KEYS } from "./constants";
import { CONSOLE_PREFS_STORAGE_KEY, getConsolePrefs, resetConsolePrefsCache } from "../../utils/consolePrefs";
import type { GameDto, ThemeConfig } from "../../types";

vi.mock("../../utils/soundEffects", () => ({
  default: { playNav: vi.fn(), playSelect: vi.fn() },
}));

const theme = { id: "default", name: "Default" } as unknown as ThemeConfig;
const games = [{ id: "a" }, { id: "b" }] as unknown as GameDto[];

function Harness(props: Partial<UseFullscreenMenuOptions>) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(true);
  const menu = useFullscreenMenu({
    updater: null,
    themes: [theme],
    currentTheme: theme,
    onSelectTheme: vi.fn(),
    locale: "en",
    setLocale: vi.fn(),
    filteredGames: games,
    focusedIndex: 0,
    setFocusedIndex: vi.fn(),
    isMenuOpen,
    setIsMenuOpen,
    searchQuery: "",
    setShowVirtualKeyboard: vi.fn(),
    layout: "shelf",
    toggleLayout: vi.fn(),
    isSyncing: false,
    handleSync: vi.fn(),
    scale: 1,
    stepScale: vi.fn(() => true),
    soundEnabled: true,
    handleToggleSound: vi.fn(),
    styleSetting: "auto",
    effectiveFamily: "xbox",
    cycleControllerStyle: vi.fn(),
    onPowerAction: vi.fn(),
    confirm: null,
    t: (k: string) => k,
    ...props,
  });

  return (
    <div>
      <span data-testid="menu-state">{isMenuOpen ? "open" : "closed"}</span>
      <span data-testid="depth">{menu.menuLevels.length}</span>
      <span data-testid="focused">{menu.focusedMenuItem?.id}</span>
      <FullscreenQuickMenu
        isMenuOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        clock="21:30"
        menuItems={menu.menuItems}
        safeMenuIndex={menu.safeMenuIndex}
        setMenuFocusedIndex={menu.setMenuFocusedIndex}
        soundEffects={{ playSelect: vi.fn() }}
        t={(k) => k}
        menuSectionLabelKeys={MENU_SECTION_LABEL_KEYS}
        menuItemRefs={menu.menuItemRefs}
        levels={menu.menuLevels}
        onBack={menu.goBackMenu}
        onSelectParentItem={menu.selectParentMenuItem}
      />
    </div>
  );
}

const nav = (direction: "up" | "down" | "left" | "right") =>
  act(() => {
    window.dispatchEvent(new CustomEvent("omnis:menu-nav", { detail: { direction } }));
  });
const pressA = () =>
  act(() => {
    window.dispatchEvent(new CustomEvent("omnis:menu-action-a"));
  });

describe("FullscreenQuickMenu sub menus", () => {
  beforeEach(() => {
    localStorage.clear();
    resetConsolePrefsCache();
  });

  it("toggles clock and battery preferences from Settings → General", () => {
    render(<Harness />);
    expect(screen.getByText("21:30")).toBeTruthy();

    fireEvent.click(screen.getByText("Settings"));
    nav("right"); // General is the first category
    expect(screen.getByTestId("depth").textContent).toBe("3");
    expect(screen.getByText("Show battery percentage")).toBeTruthy();

    fireEvent.click(screen.getByText("Show clock"));
    expect(getConsolePrefs().showClock).toBe(false);
    expect(screen.queryByText("21:30")).toBeNull();

    // The percentage option only makes sense while the battery is shown
    fireEvent.click(screen.getByText("Show battery status"));
    expect(getConsolePrefs().showBattery).toBe(false);
    expect(screen.queryByText("Show battery percentage")).toBeNull();

    fireEvent.click(screen.getByText("Clear filters on startup"));
    expect(getConsolePrefs().clearFiltersOnStartup).toBe(false);
    expect(JSON.parse(localStorage.getItem(CONSOLE_PREFS_STORAGE_KEY) ?? "{}")).toMatchObject({
      showClock: false,
      showBattery: false,
      clearFiltersOnStartup: false,
    });
  });
  it("lists system actions directly in the root menu instead of a power dialog", () => {
    render(<Harness />);
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("console_ui.desktop_mode")).toBeTruthy();
    expect(screen.getByText("console_ui.exit")).toBeTruthy();
    expect(screen.getByText("console_ui.sleep")).toBeTruthy();
    expect(screen.getByText("console_ui.restart")).toBeTruthy();
    expect(screen.getByText("console_ui.shutdown")).toBeTruthy();
    expect(screen.queryByText("console_ui.power_options_desc")).toBeNull();
  });

  it("opens Settings → category panel and unwinds one level per Back press", () => {
    const handleToggleSound = vi.fn();
    render(<Harness handleToggleSound={handleToggleSound} />);

    fireEvent.click(screen.getByText("Settings"));
    expect(screen.getByTestId("depth").textContent).toBe("2");
    expect(screen.getByText("Audio")).toBeTruthy();

    // Settings → Audio (5th category) with the D-pad, then enter it with Right
    nav("down");
    nav("down");
    nav("down");
    nav("down");
    expect(screen.getByTestId("focused").textContent).toBe("settings-cat-audio");
    nav("right");
    expect(screen.getByTestId("depth").textContent).toBe("3");
    expect(screen.getByTestId("focused").textContent).toBe("sound");
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");

    pressA();
    expect(handleToggleSound).toHaveBeenCalledTimes(1);

    // Back: panel → categories → root → closed
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("depth").textContent).toBe("2");
    expect(screen.getByTestId("focused").textContent).toBe("settings-cat-audio");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("depth").textContent).toBe("1");
    expect(screen.getByTestId("menu-state").textContent).toBe("open");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("menu-state").textContent).toBe("closed");
  });

  it("switches category by clicking the parent list while a panel is open", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Settings"));
    fireEvent.click(screen.getByText("Audio"));
    expect(screen.getByText("console_ui.sound")).toBeTruthy();

    fireEvent.click(screen.getByText("Input"));
    expect(screen.getByTestId("depth").textContent).toBe("3");
    expect(screen.getByTestId("focused").textContent).toBe("controller-style");
    expect(screen.queryByText("console_ui.sound")).toBeNull();
  });

  it("asks for a second press before running a system action", () => {
    const onPowerAction = vi.fn();
    render(<Harness onPowerAction={onPowerAction} />);

    fireEvent.click(screen.getByText("console_ui.shutdown"));
    expect(onPowerAction).not.toHaveBeenCalled();
    expect(screen.getByText("Press again to confirm")).toBeTruthy();
    expect(screen.getByTestId("focused").textContent).toBe("shutdown");

    pressA();
    expect(onPowerAction).toHaveBeenCalledWith("shutdown");
    expect(screen.getByTestId("menu-state").textContent).toBe("closed");
  });

  it("cancels a pending confirmation when the focus moves away", () => {
    const onPowerAction = vi.fn();
    render(<Harness onPowerAction={onPowerAction} />);

    fireEvent.click(screen.getByText("console_ui.restart"));
    expect(screen.getByText("Press again to confirm")).toBeTruthy();
    nav("down");
    expect(screen.queryByText("Press again to confirm")).toBeNull();
    nav("up");
    pressA();
    expect(onPowerAction).not.toHaveBeenCalled();
    expect(screen.getByText("Press again to confirm")).toBeTruthy();
  });

  it("toggles quick filters visibility in Settings → Quick Filters and resets them", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Settings"));
    fireEvent.click(screen.getByText("Quick Filters"));
    expect(screen.getByTestId("depth").textContent).toBe("3");

    fireEvent.click(screen.getByText("installed"));
    expect(getConsolePrefs().hiddenQuickFilters).toContain("installed");
    expect(screen.getByText("Show all filters")).toBeTruthy();

    fireEvent.click(screen.getByText("Show all filters"));
    expect(getConsolePrefs().hiddenQuickFilters).toEqual([]);
    expect(screen.queryByText("Show all filters")).toBeNull();
  });

  it("shows Clear filters in root menu when a filter is active", () => {
    const onClearFilters = vi.fn();
    render(<Harness activeCategory="installed" onClearFilters={onClearFilters} />);
    fireEvent.click(screen.getByText("Clear filters"));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("menu-state").textContent).toBe("closed");
  });
});
