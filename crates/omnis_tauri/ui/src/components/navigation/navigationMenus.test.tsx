import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { I18nProvider } from "@/i18n";
import AppMenuDropdown from "./AppMenuDropdown";
import FilterAndSortPopover from "./FilterAndSortPopover";
import GroupByPopover from "./GroupByPopover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

describe("Phase 3 Popover, Dropdown & Tooltip", () => {
  it("renders AppMenuDropdown items with role=menu and keeps menu open on audio toggle", () => {
    const onOpenChange = vi.fn();
    const onToggleSound = vi.fn();
    const onOpenThemeModal = vi.fn();

    render(
      <AppMenuDropdown
        trigger={<button type="button">Menu</button>}
        isOpen={true}
        onOpenChange={onOpenChange}
        onOpenThemeModal={onOpenThemeModal}
        onOpenPluginModal={vi.fn()}
        onOpenAddCustomModal={vi.fn()}
        onOpenBatchEnrichModal={vi.fn()}
        onToggleSound={onToggleSound}
        soundEnabled={true}
      />
    );

    expect(screen.getByRole("menu")).toBeTruthy();
    const audioItem = screen.getByRole("menuitem", { name: /Effetti Audio/i });
    fireEvent.click(audioItem);
    expect(onToggleSound).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    const themeItem = screen.getByRole("menuitem", { name: /Temi/i });
    fireEvent.click(themeItem);
    expect(onOpenThemeModal).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders FilterAndSortPopover and updates sort mode", () => {
    const onSortChange = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <I18nProvider initialLocale="en">
        <FilterAndSortPopover
          trigger={<button type="button">Filter</button>}
          isOpen={true}
          onOpenChange={onOpenChange}
          sortMode="recent"
          onSortChange={onSortChange}
          selectedFlags={[]}
          onToggleFlag={vi.fn()}
          selectedStatuses={[]}
          onToggleStatus={vi.fn()}
          selectedStores={[]}
          onToggleStore={vi.fn()}
          selectedGenres={[]}
          onToggleGenre={vi.fn()}
          selectedFeatures={[]}
          onToggleFeature={vi.fn()}
          onClearAll={vi.fn()}
          totalActiveFilters={0}
          filterCounts={{
            total: 10,
            installed: 5,
            favorites: 2,
            recent: 3,
            stores: { steam: 5 },
            statuses: {},
            genres: { Action: 4 },
            features: {},
          }}
          availableGenres={["Action"]}
          availableFeatures={[]}
        />
      </I18nProvider>
    );

    expect(screen.getByText("Steam")).toBeTruthy();
    expect(screen.getByText("Action")).toBeTruthy();
    fireEvent.click(screen.getByText(/A-Z/i));
    expect(onSortChange).toHaveBeenCalledWith("title");
  });

  it("renders GroupByPopover and selects a group mode", () => {
    const onSelectGroup = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <I18nProvider initialLocale="en">
        <GroupByPopover
          trigger={<button type="button">Group</button>}
          isOpen={true}
          onOpenChange={onOpenChange}
          groupBy="none"
          onSelectGroup={onSelectGroup}
        />
      </I18nProvider>
    );

    const storeOption = screen.getByText(/Store|Platform/i);
    fireEvent.click(storeOption);
    expect(onSelectGroup).toHaveBeenCalledWith("library");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders Tooltip inside TooltipProvider", () => {
    render(
      <TooltipProvider>
        <Tooltip open={true}>
          <TooltipTrigger asChild>
            <button type="button">Sync</button>
          </TooltipTrigger>
          <TooltipContent>Sync libraries</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    expect(screen.getAllByText("Sync libraries").length).toBeGreaterThan(0);
  });
});
