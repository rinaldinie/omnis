import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import React, { act } from "react";
import ReactDOM from "react-dom/client";
import { useLibraryFilters } from "./useLibraryFilters";
import type { GameDto } from "../types";

vi.mock("../i18n", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key,
  }),
}));

type MockWindow = EventTarget & { HTMLIFrameElement: typeof HTMLIFrameElement };
type MockElement = EventTarget & {
  nodeType: number;
  tagName: string;
  style: Record<string, string>;
  ownerDocument?: MockDocument | Document;
  setAttribute: () => void;
  appendChild: () => void;
  removeChild: () => void;
  childNodes: unknown[];
};
type MockDocument = EventTarget & {
  defaultView: MockWindow;
  nodeType: number;
  activeElement: null;
  createElement: (tag: string) => MockElement;
  createElementNS: (_ns: string, tag: string) => MockElement;
  createTextNode: () => EventTarget;
  createComment: () => EventTarget;
};

const globalMock = globalThis as unknown as {
  window?: MockWindow | (Window & typeof globalThis);
  document?: MockDocument | Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const originalWindow = globalMock.window;
const originalDocument = globalMock.document;

beforeAll(() => {
  const win = new EventTarget() as MockWindow;
  win.HTMLIFrameElement = class HTMLIFrameElement {} as unknown as typeof HTMLIFrameElement;
  globalMock.window = win;

  const doc = new EventTarget() as MockDocument;
  doc.defaultView = win;
  doc.nodeType = 9;
  doc.activeElement = null;
  doc.createElement = (tag: string) => {
    const node = new EventTarget() as MockElement;
    node.nodeType = 1;
    node.tagName = tag.toUpperCase();
    node.style = {};
    node.setAttribute = () => {};
    node.appendChild = () => {};
    node.removeChild = () => {};
    node.childNodes = [];
    return node;
  };
  doc.createElementNS = (_ns: string, tag: string) => doc.createElement(tag);
  doc.createTextNode = () => new EventTarget();
  doc.createComment = () => new EventTarget();
  globalMock.document = doc;
  globalMock.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  globalMock.window = originalWindow;
  globalMock.document = originalDocument;
});

function createMockGame(overrides: Partial<GameDto> = {}): GameDto {
  return {
    id: "game-" + Math.random().toString(36).substring(2, 9),
    title: "Test Game",
    library: "steam",
    is_installed: true,
    is_hidden: false,
    hidden_by_duplicate_hider: false,
    duplicate_group_id: null,
    playtime_seconds: 0,
    playtime_formatted: "0m",
    critic_score: null,
    release_date: null,
    description: null,
    cover_image: null,
    background_image: null,
    genres: [],
    developers: [],
    ...overrides,
  };
}

function renderHook<T>(hook: () => T) {
  const result = { current: null as unknown as T };

  function TestComponent() {
    result.current = hook();
    return null;
  }

  const container = new EventTarget() as MockElement;
  container.nodeType = 1;
  container.tagName = "DIV";
  container.ownerDocument = globalMock.document;
  container.appendChild = () => {};
  container.removeChild = () => {};

  const root = ReactDOM.createRoot(container as unknown as Element);
  act(() => {
    root.render(React.createElement(TestComponent));
  });

  return {
    result,
    rerender: () => {
      act(() => {
        root.render(React.createElement(TestComponent));
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

describe("useLibraryFilters - Duplicate Hider and Hidden Games integration", () => {
  const sampleGames: GameDto[] = [
    createMockGame({
      id: "visible-1",
      title: "Hades",
      library: "steam",
      is_hidden: false,
    }),
    createMockGame({
      id: "hidden-auto-1",
      title: "Hades",
      library: "epic",
      is_hidden: true,
      hidden_by_duplicate_hider: true,
      duplicate_group_id: "hades",
    }),
    createMockGame({
      id: "visible-2",
      title: "Cyberpunk 2077",
      library: "steam",
      is_hidden: false,
    }),
    createMockGame({
      id: "hidden-manual-1",
      title: "Half-Life 2",
      library: "steam",
      is_hidden: true,
      hidden_by_duplicate_hider: false,
    }),
    createMockGame({
      id: "hidden-auto-2",
      title: "Cyberpunk 2077",
      library: "gog",
      is_hidden: true,
      hidden_by_duplicate_hider: true,
      duplicate_group_id: "cyberpunk 2077",
    }),
  ];

  it("excludes hidden games by default in filteredGames", () => {
    const { result } = renderHook(() => useLibraryFilters(sampleGames));

    expect(result.current.filteredGames).toHaveLength(2);
    expect(result.current.filteredGames.map((g) => g.id)).toEqual(["visible-1", "visible-2"]);
    expect(result.current.filteredGames.every((g) => !g.is_hidden)).toBe(true);
  });

  it("returns only hidden games when selectedFlags includes 'hidden'", () => {
    const { result } = renderHook(() => useLibraryFilters(sampleGames));

    act(() => {
      result.current.selectFilter("hidden");
    });

    expect(result.current.isFilterActive("hidden")).toBe(true);
    expect(result.current.filteredGames).toHaveLength(3);
    expect(result.current.filteredGames.every((g) => g.is_hidden === true)).toBe(true);

    const hiddenIds = result.current.filteredGames.map((g) => g.id);
    expect(hiddenIds).toContain("hidden-auto-1");
    expect(hiddenIds).toContain("hidden-manual-1");
    expect(hiddenIds).toContain("hidden-auto-2");
  });

  it("accurately calculates filterCounts for hidden and total visible games", () => {
    const { result } = renderHook(() => useLibraryFilters(sampleGames));

    // Total in sampleGames = 5
    // Hidden games = 3 (2 auto-hidden duplicates + 1 manual hide)
    // Visible games = 2
    expect(result.current.filterCounts.hidden).toBe(3);
    expect(result.current.filterCounts.total).toBe(2);
  });

  it("allows filtering within hidden games by store and search", () => {
    const { result } = renderHook(() => useLibraryFilters(sampleGames));

    act(() => {
      result.current.selectFilter("hidden");
    });
    expect(result.current.filteredGames).toHaveLength(3);

    // Filter by store: Epic
    act(() => {
      result.current.toggleStore("epic");
    });
    expect(result.current.filteredGames).toHaveLength(1);
    expect(result.current.filteredGames[0].id).toBe("hidden-auto-1");
    expect(result.current.filteredGames[0].library).toBe("epic");

    // Search within hidden games
    act(() => {
      result.current.toggleStore("epic"); // uncheck store
      result.current.setSearchQuery("Half-Life");
    });
    expect(result.current.filteredGames).toHaveLength(1);
    expect(result.current.filteredGames[0].id).toBe("hidden-manual-1");
    expect(result.current.filteredGames[0].title).toBe("Half-Life 2");
  });

  it("toggles hidden filter on and off", () => {
    const { result } = renderHook(() => useLibraryFilters(sampleGames));

    // Initially visible games only
    expect(result.current.filteredGames).toHaveLength(2);

    // Toggle hidden on
    act(() => {
      result.current.toggleFlag("hidden");
    });
    expect(result.current.filteredGames).toHaveLength(3);
    expect(result.current.isFilterActive("hidden")).toBe(true);

    // Toggle hidden off
    act(() => {
      result.current.toggleFlag("hidden");
    });
    expect(result.current.filteredGames).toHaveLength(2);
    expect(result.current.isFilterActive("hidden")).toBe(false);
    expect(result.current.filteredGames.every((g) => !g.is_hidden)).toBe(true);
  });
});
