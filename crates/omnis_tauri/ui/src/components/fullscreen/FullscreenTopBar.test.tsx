import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { FullscreenTopBar } from "./FullscreenTopBar";
import { STORE_LABELS } from "./constants";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockRejectedValue(new Error("Outside Tauri")),
}));

vi.mock("../../utils/soundEffects", () => ({
  default: { playNav: vi.fn(), playSelect: vi.fn() },
}));

describe("FullscreenTopBar", () => {
  it("includes amazon in STORE_LABELS", () => {
    expect(STORE_LABELS.amazon).toBe("Amazon Games");
  });

  it("renders Amazon Games store tab as an icon and not raw text", () => {
    const setActiveFilter = vi.fn();
    const setFocusedIndex = vi.fn();
    const visibleFilters = ["all", "installed", "steam", "amazon"];

    render(
      <FullscreenTopBar
        visibleFilters={visibleFilters}
        activeCategory="all"
        filterLabel={(id) => STORE_LABELS[id] ?? id}
        filterCount={(id) => (id === "amazon" ? 3 : 5)}
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

    // The button for Amazon Games should have aria-label and title
    const amazonButton = screen.getByRole("button", { name: "Amazon Games" });
    expect(amazonButton).toBeDefined();
    expect(amazonButton.getAttribute("title")).toBe("Amazon Games (3)");

    // Inside the button, there should be an SVG icon with aria-label="Amazon Games"
    const svgIcon = amazonButton.querySelector("svg");
    expect(svgIcon).not.toBeNull();
    expect(svgIcon?.getAttribute("aria-label")).toBe("Amazon Games");

    // The text name "Amazon Games" or "amazon" should NOT be rendered as visible text content inside the button
    expect(amazonButton.textContent).toBe("");

    // Clicking the amazon filter tab selects it
    fireEvent.click(amazonButton);
    expect(setActiveFilter).toHaveBeenCalledWith("amazon");
    expect(setFocusedIndex).toHaveBeenCalledWith(0);
  });
});
