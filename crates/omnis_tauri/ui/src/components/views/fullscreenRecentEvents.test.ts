import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

describe("Fullscreen recent games events contract", () => {
  const globalMock = globalThis as unknown as {
    window?: EventTarget | (Window & typeof globalThis);
  };
  const originalWindow = globalMock.window;

  beforeAll(() => {
    globalMock.window = new EventTarget();
  });

  afterAll(() => {
    globalMock.window = originalWindow;
  });

  it("dispatches and handles omnis:recent-action with launch", () => {
    const handleLaunch = vi.fn();
    const gameId = "game-123";

    const listener = (e: Event) => {
      const action = (e as CustomEvent<{ action?: "launch" | "details" }>).detail?.action ?? "launch";
      if (action === "launch") {
        handleLaunch(gameId);
      }
    };

    window.addEventListener("omnis:recent-action", listener);
    window.dispatchEvent(
      new CustomEvent("omnis:recent-action", {
        detail: { action: "launch" },
      })
    );
    window.removeEventListener("omnis:recent-action", listener);

    expect(handleLaunch).toHaveBeenCalledWith(gameId);
  });

  it("dispatches and handles omnis:recent-action with details", () => {
    const showDetails = vi.fn();
    const gameId = "game-456";

    const listener = (e: Event) => {
      const action = (e as CustomEvent<{ action?: "launch" | "details" }>).detail?.action ?? "launch";
      if (action === "details") {
        showDetails(gameId);
      }
    };

    window.addEventListener("omnis:recent-action", listener);
    window.dispatchEvent(
      new CustomEvent("omnis:recent-action", {
        detail: { action: "details" },
      })
    );
    window.removeEventListener("omnis:recent-action", listener);

    expect(showDetails).toHaveBeenCalledWith(gameId);
  });

  it("handles omnis:recent-action-a alias fallback to launch", () => {
    const handleLaunch = vi.fn();
    const gameId = "game-789";

    const listener = (e: Event) => {
      const action = (e as CustomEvent<{ action?: "launch" | "details" }>).detail?.action ?? "launch";
      if (action === "launch") {
        handleLaunch(gameId);
      }
    };

    window.addEventListener("omnis:recent-action-a", listener);
    window.dispatchEvent(new CustomEvent("omnis:recent-action-a"));
    window.removeEventListener("omnis:recent-action-a", listener);

    expect(handleLaunch).toHaveBeenCalledWith(gameId);
  });

  it("clamps recent navigation correctly within available bounds", () => {
    const totalRecent = 3;
    let recentIndex = 0;

    const navigate = (dir: "left" | "right") => {
      const cur = Math.min(recentIndex, Math.max(0, totalRecent - 1));
      recentIndex = dir === "right" ? Math.min(totalRecent - 1, cur + 1) : Math.max(0, cur - 1);
    };

    // Right within bounds
    navigate("right");
    expect(recentIndex).toBe(1);
    navigate("right");
    expect(recentIndex).toBe(2);
    // Right at boundary doesn't overflow
    navigate("right");
    expect(recentIndex).toBe(2);

    // Left within bounds
    navigate("left");
    expect(recentIndex).toBe(1);
    navigate("left");
    expect(recentIndex).toBe(0);
    // Left at boundary doesn't underflow
    navigate("left");
    expect(recentIndex).toBe(0);
  });
});
