import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "omnis_fullscreen_ui_scale";
const BASE_FONT_PX = 16;

export const UI_SCALE_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6] as const;

function readSavedScale(): number {
  try {
    const saved = parseFloat(localStorage.getItem(STORAGE_KEY) ?? "");
    if (UI_SCALE_STEPS.includes(saved as (typeof UI_SCALE_STEPS)[number])) return saved;
  } catch {
    // localStorage unavailable: fall back to default scale
  }
  return 1;
}

/**
 * Interface scale for the fullscreen (console) mode.
 *
 * Scales the root font size while `active`, so every rem-based size
 * (Tailwind spacing, widths and text) grows or shrinks together.
 * The previous root font size is restored when leaving fullscreen.
 */
export function useUiScale(active: boolean) {
  const [scale, setScale] = useState<number>(readSavedScale);

  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = `${BASE_FONT_PX * scale}px`;
    return () => {
      root.style.fontSize = previous;
    };
  }, [active, scale]);

  const applyScale = useCallback((next: number) => {
    setScale(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Not persisted, still applied for this session
    }
  }, []);

  const stepScale = useCallback(
    (delta: 1 | -1, wrap = false) => {
      const idx = UI_SCALE_STEPS.indexOf(scale as (typeof UI_SCALE_STEPS)[number]);
      const current = idx === -1 ? UI_SCALE_STEPS.indexOf(1) : idx;
      const last = UI_SCALE_STEPS.length - 1;
      let nextIdx = current + delta;
      if (wrap) nextIdx = (nextIdx + UI_SCALE_STEPS.length) % UI_SCALE_STEPS.length;
      nextIdx = Math.max(0, Math.min(last, nextIdx));
      if (nextIdx === current) return false;
      applyScale(UI_SCALE_STEPS[nextIdx]);
      return true;
    },
    [scale, applyScale]
  );

  const resetScale = useCallback(() => applyScale(1), [applyScale]);

  return { scale, stepScale, resetScale };
}
