import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLibraryFilters } from "./useLibraryFilters";
import { resetConsolePrefsCache, setConsolePref } from "../utils/consolePrefs";

vi.mock("../i18n", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key,
  }),
}));

describe("useLibraryFilters startup filters", () => {
  beforeEach(() => {
    localStorage.clear();
    resetConsolePrefsCache();
  });

  it("starts clean by default even when filters were saved", () => {
    const first = renderHook(() => useLibraryFilters([]));
    act(() => first.result.current.setActiveFilter("installed"));
    expect(first.result.current.activeFilter).toBe("installed");
    first.unmount();

    const second = renderHook(() => useLibraryFilters([]));
    expect(second.result.current.activeFilter).toBe("all");
  });

  it("restores the last filters when clearing on startup is disabled", () => {
    setConsolePref("clearFiltersOnStartup", false);

    const first = renderHook(() => useLibraryFilters([]));
    act(() => first.result.current.selectFilter("steam"));
    expect(first.result.current.activeFilter).toBe("steam");
    first.unmount();

    const second = renderHook(() => useLibraryFilters([]));
    expect(second.result.current.activeFilter).toBe("steam");
  });

  it("normalizes and deduplicates legacy localized genres loaded from storage", () => {
    setConsolePref("clearFiltersOnStartup", false);
    localStorage.setItem(
      "omnis_library_filters",
      JSON.stringify({
        stores: [],
        statuses: [],
        flags: [],
        genres: ["Azione", "Action", "Role-Playing"],
        features: [],
      })
    );

    const { result } = renderHook(() => useLibraryFilters([]));
    expect(result.current.selectedGenres).toEqual(["action", "rpg"]);
    expect(result.current.activeChips.map((c) => c.id)).toEqual(["genre:action", "genre:rpg"]);
  });
});
