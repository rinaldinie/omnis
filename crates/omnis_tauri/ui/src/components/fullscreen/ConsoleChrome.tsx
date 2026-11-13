import React from "react";
import type { ControllerType, InputDevice, ControllerStyleSetting } from "../../hooks/useGamepadNavigation";
import { CONSOLE_PILL_STYLE } from "./constants";

export type { ControllerType, InputDevice, ControllerStyleSetting };

/**
 * Glyph kinds refer to the Standard Gamepad layout by position:
 * "a" bottom, "b" right, "x" left, "y" top face button.
 */
export type GlyphKind = "a" | "b" | "x" | "y" | "lb" | "rb" | "bumpers" | "r3" | "menu" | "key";
type FaceKind = "a" | "b" | "x" | "y";

export interface InputPromptContextValue {
  activeDevice: InputDevice;
  controllerType: ControllerType;
  effectiveFamily: ControllerType;
  styleSetting: ControllerStyleSetting;
  setStyleSetting: (style: ControllerStyleSetting) => void;
}

export const InputPromptContext = React.createContext<InputPromptContextValue>({
  activeDevice: "keyboard",
  controllerType: "xbox",
  effectiveFamily: "xbox",
  styleSetting: "auto",
  setStyleSetting: () => {},
});

export const useInputPrompt = () => React.useContext(InputPromptContext);

/** Family of the connected controller, so glyphs match the buttons in the player's hands. */
export const ControllerTypeContext = React.createContext<ControllerType>("xbox");

const FACE_GLYPHS: Record<ControllerType, Record<FaceKind, string>> = {
  xbox: { a: "A", b: "B", x: "X", y: "Y" },
  playstation: { a: "✕", b: "○", x: "□", y: "△" },
  // Nintendo labels are swapped relative to their position
  nintendo: { a: "B", b: "A", x: "Y", y: "X" },
};

const SHOULDER_LABELS: Record<ControllerType, Record<"lb" | "rb" | "bumpers" | "r3", string>> = {
  xbox: { lb: "LB", rb: "RB", bumpers: "LB RB", r3: "R3" },
  playstation: { lb: "L1", rb: "R1", bumpers: "L1 R1", r3: "R3" },
  nintendo: { lb: "L", rb: "R", bumpers: "L R", r3: "RS" },
};

const KEYBOARD_KEYCAPS: Record<GlyphKind, string> = {
  lb: "Q",
  rb: "E",
  bumpers: "Q / E",
  a: "↵",
  b: "Esc",
  x: "X",
  y: "S",
  menu: "M",
  r3: "Tab",
  key: "",
};

/** Controller or keyboard keycap button glyph, sized in em so it follows the surrounding text and UI scale. */
export function Glyph({ kind, label }: { kind: GlyphKind; label?: string }) {
  const { activeDevice, effectiveFamily: promptFamily, styleSetting } = useInputPrompt();
  const legacyController = React.useContext(ControllerTypeContext);
  const effectiveFamily: ControllerType = promptFamily || legacyController || "xbox";

  const isKeyboard =
    styleSetting === "keyboard" ||
    (styleSetting === "auto" && activeDevice === "keyboard");

  if (isKeyboard) {
    const keycapText = label ?? KEYBOARD_KEYCAPS[kind] ?? kind.toUpperCase();
    return (
      <span
        className="inline-flex items-center justify-center min-w-[1.6em] h-[1.6em] px-[0.45em] rounded-[0.35em] border border-white/40 bg-white/10 text-[0.8em] font-mono font-bold text-white shadow-sm leading-none shrink-0"
        title={kind === "a" ? "Enter" : keycapText}
      >
        {keycapText}
      </span>
    );
  }

  // Controller mode (Xbox / PlayStation / Nintendo)
  if (kind === "a" || kind === "b" || kind === "x" || kind === "y") {
    const familyFace = FACE_GLYPHS[effectiveFamily] || FACE_GLYPHS.xbox;
    return (
      <span className="inline-flex items-center justify-center w-[1.65em] h-[1.65em] rounded-full border border-white/35 bg-white/15 text-white font-bold text-[0.85em] leading-none shrink-0">
        {familyFace[kind]}
      </span>
    );
  }

  if (kind === "lb" || kind === "rb" || kind === "bumpers" || kind === "r3") {
    const familyShoulder = SHOULDER_LABELS[effectiveFamily] || SHOULDER_LABELS.xbox;
    label = familyShoulder[kind];
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
  onClick?: () => void;
}

/** Bottom controller legend bar, matching the top console capsules. */
export function ControllerLegend({ left, right }: { left?: LegendEntry[]; right: LegendEntry[] }) {
  const renderEntry = (entry: LegendEntry) => {
    const content = (
      <>
        <Glyph kind={entry.kind} label={entry.glyphLabel} />
        <span className="uppercase tracking-wider">{entry.label}</span>
      </>
    );

    if (entry.onClick) {
      return (
        <button
          key={`${entry.kind}-${entry.label}`}
          type="button"
          onClick={entry.onClick}
          className="cursor-pointer bg-transparent border-none flex items-center gap-2.5 px-3 py-1.5 -mx-3 -my-1.5 rounded-full text-[#f8fafc] hover:bg-white/15 active:bg-white/20 transition-colors font-inherit"
        >
          {content}
        </button>
      );
    }

    return (
      <span
        key={`${entry.kind}-${entry.label}`}
        className="flex items-center gap-2.5 text-[#f8fafc]"
      >
        {content}
      </span>
    );
  };

  return (
    <footer className="relative z-30 flex items-center justify-between px-10 pt-2 pb-5 shrink-0 text-sm font-semibold uppercase tracking-wider">
      {left && left.length > 0 ? (
        <div
          className="h-12 inline-flex items-center gap-7 px-6 rounded-full backdrop-blur-md shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
          style={CONSOLE_PILL_STYLE}
        >
          {left.map(renderEntry)}
        </div>
      ) : (
        <div />
      )}
      <div
        className="h-12 inline-flex items-center gap-7 px-6 rounded-full backdrop-blur-md shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
        style={CONSOLE_PILL_STYLE}
      >
        {right.map(renderEntry)}
      </div>
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
