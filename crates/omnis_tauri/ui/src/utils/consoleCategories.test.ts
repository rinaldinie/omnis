import { describe, it, expect } from "vitest";
import {
  getVisibleCategories,
  toCategoryId,
  categoryCount,
} from "./consoleCategories";
import type { LibraryCounts } from "../types";

const mockCounts: LibraryCounts = {
  total: 10,
  installed: 4,
  recent: 2,
  favorites: 1,
  steam: 5,
  gog: 3,
  epic: 2,
  xbox: 0,
  amazon: 9,
  action: 0,
  rpg: 0,
  strategy: 0,
  indie: 0,
  hidden: 0,
  switch: 0,
};

describe("consoleCategories", () => {
  describe("toCategoryId", () => {
    it("normalizes known filter names to lower-case", () => {
      expect(toCategoryId("GOG")).toBe("gog");
      expect(toCategoryId("  STEAM  ")).toBe("steam");
    });

    it("preserves unknown filters as-is", () => {
      expect(toCategoryId("genre:Action")).toBe("genre:Action");
    });
  });

  describe("categoryCount", () => {
    it("maps 'all' to total and specific stores to their counts", () => {
      expect(categoryCount(mockCounts, "all")).toBe(10);
      expect(categoryCount(mockCounts, "gog")).toBe(3);
      expect(categoryCount(mockCounts, "xbox")).toBe(0);
    });
  });

  describe("getVisibleCategories", () => {
    it("includes pinned categories and populated stores when no filters are hidden", () => {
      const visible = getVisibleCategories(mockCounts, "all", []);
      expect(visible).toContain("all");
      expect(visible).toContain("installed");
      expect(visible).toContain("recent");
      expect(visible).toContain("favorites");
      expect(visible).toContain("steam");
      expect(visible).toContain("gog");
      expect(visible).toContain("epic");
      expect(visible).toContain("amazon");
      expect(visible).not.toContain("xbox"); // 0 games and not pinned
    });

    it("excludes hidden filters when activeFilter is different", () => {
      const visible = getVisibleCategories(mockCounts, "all", ["gog"]);
      expect(visible).toContain("steam");
      expect(visible).toContain("epic");
      expect(visible).not.toContain("gog");
    });

    it("excludes multiple hidden filters", () => {
      const visible = getVisibleCategories(mockCounts, "all", ["gog", "steam", "installed"]);
      expect(visible).toContain("all");
      expect(visible).not.toContain("gog");
      expect(visible).not.toContain("steam");
      expect(visible).not.toContain("installed");
      expect(visible).toContain("epic");
    });

    it("keeps active filter visible even if in hiddenQuickFilters until navigated away", () => {
      const visible = getVisibleCategories(mockCounts, "gog", ["gog"]);
      expect(visible).toContain("gog");

      // Once active filter changes to another, gog is excluded
      const visibleAfterNav = getVisibleCategories(mockCounts, "steam", ["gog"]);
      expect(visibleAfterNav).not.toContain("gog");
    });
  });
});
