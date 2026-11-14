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
});
