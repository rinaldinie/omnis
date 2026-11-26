import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import React from "react";
import { I18nProvider } from "@/i18n";
import { api } from "../../api";
import { DuplicateHiderSettingsTab } from "./DuplicateHiderSettingsTab";
import { EmulatorsSettingsTab } from "./EmulatorsSettingsTab";
import type { DuplicateHiderConfig, GameDto } from "@/types";

const mockSummaryGames = [
  {
    id: "g1",
    external_id: "0100123456789000",
    title: "Zelda Switch",
    library: "switch",
    is_installed: true,
    playtime_seconds: 3600,
    playtime_formatted: "1h 0m",
    duplicate_group_id: "zelda",
    hidden_by_duplicate_hider: false,
  },
] as unknown as GameDto[];

const defaultDhConfig: DuplicateHiderConfig = {
  enabled: true,
  store_priority: ["steam", "gog", "epic", "xbox", "amazon", "switch", "custom"],
  prefer_installed: true,
  ignore_edition_suffixes: true,
  show_other_copies_in_menu: true,
  show_store_badges_on_card: true,
  ignored_game_ids: [],
};

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      games: {
        ...actual.api.games,
        getGames: vi.fn(),
        getGamesSummary: vi.fn(),
        getDuplicateHiderConfig: vi.fn(),
        getEmulatorStatus: vi.fn(),
        getEmulatorSettings: vi.fn(),
      },
    },
  };
});

describe("Settings tabs use getGamesSummary instead of full getGames", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.games.getGames).mockResolvedValue([]);
    vi.mocked(api.games.getGamesSummary).mockResolvedValue(mockSummaryGames);
    vi.mocked(api.games.getDuplicateHiderConfig).mockResolvedValue(defaultDhConfig);
    vi.mocked(api.games.getEmulatorStatus).mockResolvedValue([]);
    vi.mocked(api.games.getEmulatorSettings).mockResolvedValue({ use_emulator_keys: false });
  });

  it("DuplicateHiderSettingsTab fetches games via getGamesSummary", async () => {
    render(
      <I18nProvider initialLocale="en">
        <DuplicateHiderSettingsTab />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(api.games.getGamesSummary).toHaveBeenCalledTimes(1);
    });
    expect(api.games.getGames).not.toHaveBeenCalled();
  });

  it("EmulatorsSettingsTab fetches games via getGamesSummary", async () => {
    render(
      <I18nProvider initialLocale="en">
        <EmulatorsSettingsTab />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(api.games.getGamesSummary).toHaveBeenCalledTimes(1);
    });
    expect(api.games.getGames).not.toHaveBeenCalled();
  });
});
