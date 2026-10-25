import React from "react";
import type { ControllerType } from "../../hooks/useGamepadNavigation";

/**
 * Glyph kinds refer to the Standard Gamepad layout by position:
 * "a" bottom, "b" right, "x" left, "y" top face button.
 */
export type GlyphKind = "a" | "b" | "x" | "y" | "lb" | "rb" | "bumpers" | "r3" | "menu" | "key";
type FaceKind = "a" | "b" | "x" | "y";

/** Family of the connected controller, so glyphs match the buttons in the player's hands. */
export const ControllerTypeContext = React.createContext<ControllerType>("xbox");

const FACE_GLYPHS: Record<ControllerType, Record<FaceKind, { text: string; bg: string; fg: string }>> = {
  xbox: {
    a: { text: "A", bg: "#3fae3f", fg: "#ffffff" },
    b: { text: "B", bg: "#e5483f", fg: "#ffffff" },
    x: { text: "X", bg: "#3b82f6", fg: "#ffffff" },
    y: { text: "Y", bg: "#f2b632", fg: "#111111" },
  },
  playstation: {
    a: { text: "✕", bg: "#1f2533", fg: "#7aa7ff" },
    b: { text: "○", bg: "#1f2533", fg: "#ff6b6b" },
    x: { text: "□", bg: "#1f2533", fg: "#f08ad8" },
    y: { text: "△", bg: "#1f2533", fg: "#4fd1a5" },
  },
  // Nintendo labels are swapped relative to their position
  nintendo: {
    a: { text: "B", bg: "#3a3f4b", fg: "#ffffff" },
    b: { text: "A", bg: "#3a3f4b", fg: "#ffffff" },
    x: { text: "Y", bg: "#3a3f4b", fg: "#ffffff" },
    y: { text: "X", bg: "#3a3f4b", fg: "#ffffff" },
  },
};

const SHOULDER_LABELS: Record<ControllerType, Record<"lb" | "rb" | "bumpers" | "r3", string>> = {
  xbox: { lb: "LB", rb: "RB", bumpers: "LB RB", r3: "R3" },
  playstation: { lb: "L1", rb: "R1", bumpers: "L1 R1", r3: "R3" },
  nintendo: { lb: "L", rb: "R", bumpers: "L R", r3: "RS" },
};

/** Controller button glyph, sized in em so it follows the surrounding text and UI scale. */
export function Glyph({ kind, label }: { kind: GlyphKind; label?: string }) {
  const controller = React.useContext(ControllerTypeContext);

  if (kind === "a" || kind === "b" || kind === "x" || kind === "y") {
    const c = FACE_GLYPHS[controller][kind];
    return (
      <span
        className="inline-flex items-center justify-center w-[1.6em] h-[1.6em] rounded-full font-bold text-[0.85em] leading-none shrink-0"
        style={{ backgroundColor: c.bg, color: c.fg }}
      >
        {c.text}
      </span>
    );
  }

  if (kind === "lb" || kind === "rb" || kind === "bumpers" || kind === "r3") {
    label = SHOULDER_LABELS[controller][kind];
  }

  if (kind === "menu") {
    return (
      <span className="inline-flex flex-col justify-center gap-[0.18em] w-[1.3em] h-[1.6em] shrink-0" aria-hidden>
        <span className="block h-[0.14em] rounded bg-current" />
        <span className="block h-[0.14em] rounded bg-current" />
        <span className="block h-[0.14em] rounded bg-current" />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-center min-w-[1.6em] h-[1.6em] px-[0.45em] rounded-[0.4em] border border-white/30 bg-white/10 text-[0.75em] font-bold leading-none tracking-wide shrink-0">
      {label ?? kind.toUpperCase()}
    </span>
  );
}

export interface LegendEntry {
  kind: GlyphKind;
  label: string;
  glyphLabel?: string;
  tone?: "default" | "danger";
}

/** Bottom controller legend bar, in the style of console dashboards. */
export function ControllerLegend({ left, right }: { left?: LegendEntry[]; right: LegendEntry[] }) {
  const renderEntry = (entry: LegendEntry) => (
    <span
      key={`${entry.kind}-${entry.label}`}
      className={`flex items-center gap-2.5 ${entry.tone === "danger" ? "text-rose-300" : "text-white"}`}
    >
      <Glyph kind={entry.kind} label={entry.glyphLabel} />
      <span className="uppercase tracking-wider">{entry.label}</span>
    </span>
  );

  return (
    <footer
      className="relative z-30 flex items-center justify-between px-10 py-3 shrink-0 text-sm font-semibold"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.82)" }}
    >
      <div className="flex items-center gap-8">{left?.map(renderEntry)}</div>
      <div className="flex items-center gap-8">{right.map(renderEntry)}</div>
    </footer>
  );
}

/** Wall clock that refreshes every 15 seconds. */
export function useClock(locale: string) {
  const format = React.useCallback(
    () => new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
    [locale]
  );
  const [time, setTime] = React.useState(format);

  React.useEffect(() => {
    setTime(format());
    const id = window.setInterval(() => setTime(format()), 15000);
    return () => window.clearInterval(id);
  }, [format]);

  return time;
}
