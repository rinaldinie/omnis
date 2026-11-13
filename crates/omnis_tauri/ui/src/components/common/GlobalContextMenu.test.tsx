import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { I18nProvider } from "@/i18n";
import GlobalContextMenu from "./GlobalContextMenu";
import type { GameDto } from "@/types";

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

describe("GlobalContextMenu", () => {
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
});
