import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";
import { I18nProvider } from "@/i18n";
import { VirtualKeyboard } from "./VirtualKeyboard";

describe("VirtualKeyboard gamepad RAF gating", () => {
  const originalGetGamepads = navigator.getGamepads;
  let rafSpy: ReturnType<typeof vi.spyOn>;
  let cancelRafSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 42);
    cancelRafSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    rafSpy.mockRestore();
    cancelRafSpy.mockRestore();
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: originalGetGamepads,
    });
    vi.useRealTimers();
  });

  it("does not schedule requestAnimationFrame when open without connected gamepads", () => {
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [],
    });

    const { unmount } = render(
      <I18nProvider initialLocale="en">
        <VirtualKeyboard
          isOpen={true}
          value=""
          onChange={vi.fn()}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </I18nProvider>
    );

    expect(rafSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(rafSpy).not.toHaveBeenCalled();

    unmount();
  });

  it("starts requestAnimationFrame on gamepadconnected and stops on gamepaddisconnected", () => {
    let connectedPads: (Gamepad | null)[] = [];
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => connectedPads,
    });

    const { unmount } = render(
      <I18nProvider initialLocale="en">
        <VirtualKeyboard
          isOpen={true}
          value=""
          onChange={vi.fn()}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </I18nProvider>
    );

    expect(rafSpy).not.toHaveBeenCalled();

    const mockGamepad = {
      connected: true,
      buttons: [],
      axes: [],
    } as unknown as Gamepad;
    connectedPads = [mockGamepad];

    act(() => {
      window.dispatchEvent(new Event("gamepadconnected"));
    });
    expect(rafSpy).toHaveBeenCalledTimes(1);

    connectedPads = [];
    act(() => {
      window.dispatchEvent(new Event("gamepaddisconnected"));
    });
    expect(cancelRafSpy).toHaveBeenCalledWith(42);

    unmount();
  });
});
