import React, { useState, useEffect, useRef } from "react";
import { Search, CornerDownLeft, Delete, Space, Trash2 } from "lucide-react";
import soundEffects from "../utils/soundEffects";
import { useTranslation } from "../i18n";
import { Glyph } from "./fullscreen/ConsoleChrome";

export interface VirtualKeyboardProps {
  isOpen: boolean;
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  placeholder?: string;
  /** Number of games matching the current text, shown next to the field */
  resultCount?: number;
}

interface KeyDef {
  label: string;
  action: "char" | "backspace" | "enter" | "space" | "clear";
  char?: string;
  /** Relative width inside its row (flex-grow) */
  grow?: number;
}

const charKeys = (chars: string): KeyDef[] =>
  chars.split("").map((c) => ({ label: c, char: c, action: "char" as const }));

const KEY_ROWS: KeyDef[][] = [
  [...charKeys("1234567890"), { label: "backspace", action: "backspace", grow: 1.6 }],
  charKeys("QWERTYUIOP"),
  charKeys("ASDFGHJKL"),
  charKeys("ZXCVBNM-."),
  [
    { label: "space", action: "space", grow: 4 },
    { label: "clear", action: "clear", grow: 1.5 },
    { label: "enter", action: "enter", grow: 2 },
  ],
];

const NAV_INITIAL_DELAY = 300;
const NAV_REPEAT_INTERVAL = 110;

/** Moves the cursor, keeping the column proportional when rows have a different length. */
function moveCursor([row, col]: [number, number], dRow: number, dCol: number): [number, number] {
  if (dCol !== 0) {
    return [row, Math.max(0, Math.min(KEY_ROWS[row].length - 1, col + dCol))];
  }
  const nextRow = Math.max(0, Math.min(KEY_ROWS.length - 1, row + dRow));
  if (nextRow === row) return [row, col];
  const currCols = KEY_ROWS[row].length;
  const targetCols = KEY_ROWS[nextRow].length;
  const scaled = Math.round((col / Math.max(1, currCols - 1)) * (targetCols - 1));
  return [nextRow, Math.min(targetCols - 1, scaled)];
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  isOpen,
  value,
  onChange,
  onSubmit,
  onClose,
  placeholder,
  resultCount,
}) => {
  const { t } = useTranslation();
  const effectivePlaceholder = placeholder || t("topbar.search_placeholder");
  const [cursor, setCursor] = useState<[number, number]>([1, 0]); // Start on 'Q'

  // References to keep current callback values without re-subscribing loops
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const keyLabel = (key: KeyDef) => {
    switch (key.action) {
      case "backspace":
        return t("console_ui.kb_delete");
      case "space":
        return t("console_ui.kb_space");
      case "clear":
        return t("console_ui.kb_clear");
      case "enter":
        return t("console_ui.kb_done");
      default:
        return key.label;
    }
  };

  const keyIcon = (key: KeyDef) => {
    switch (key.action) {
      case "backspace":
        return <Delete className="w-5 h-5" />;
      case "space":
        return <Space className="w-5 h-5" />;
      case "clear":
        return <Trash2 className="w-5 h-5" />;
      case "enter":
        return <CornerDownLeft className="w-5 h-5" />;
      default:
        return null;
    }
  };

  // Execute a key action
  const executeKey = (key: KeyDef) => {
    soundEffects.playSelect();
    switch (key.action) {
      case "char":
        if (key.char) onChangeRef.current(valueRef.current + key.char);
        break;
      case "space":
        onChangeRef.current(valueRef.current + " ");
        break;
      case "backspace":
        onChangeRef.current(valueRef.current.slice(0, -1));
        break;
      case "clear":
        onChangeRef.current("");
        break;
      case "enter":
        onSubmitRef.current();
        break;
    }
  };
  const executeKeyRef = useRef(executeKey);
  executeKeyRef.current = executeKey;

  // Gamepad polling loop: edge-triggered buttons, hold-to-repeat navigation
  useEffect(() => {
    if (!isOpen) return;

    let animId: number;
    // Ignore the button that opened the keyboard until everything is released once
    let awaitingNeutral = true;
    let prevButtons: boolean[] = [];
    let navKey = "";
    let navStart = 0;
    let lastNav = 0;

    const pollGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = Array.from(gamepads).find((g): g is Gamepad => !!g && g.connected);

      if (gp) {
        const now = Date.now();
        const isDown = (i: number) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
        const ax = gp.axes;

        if (awaitingNeutral) {
          const anyActive = gp.buttons.some((_, i) => isDown(i)) || ax.some((v) => Math.abs(v) > 0.3);
          if (!anyActive) awaitingNeutral = false;
          animId = requestAnimationFrame(pollGamepad);
          return;
        }

        const isEdge = (i: number) => isDown(i) && !prevButtons[i];

        // Navigation (D-Pad or Left Stick)
        let dRow = 0;
        let dCol = 0;
        if (isDown(14) || (ax[0] ?? 0) < -0.45) dCol = -1;
        else if (isDown(15) || (ax[0] ?? 0) > 0.45) dCol = 1;
        else if (isDown(12) || (ax[1] ?? 0) < -0.45) dRow = -1;
        else if (isDown(13) || (ax[1] ?? 0) > 0.45) dRow = 1;

        const key = `${dRow},${dCol}`;
        if (dRow === 0 && dCol === 0) {
          navKey = "";
        } else if (key !== navKey || (now - navStart >= NAV_INITIAL_DELAY && now - lastNav >= NAV_REPEAT_INTERVAL)) {
          if (key !== navKey) {
            navKey = key;
            navStart = now;
          }
          lastNav = now;
          const current = cursorRef.current;
          const next = moveCursor(current, dRow, dCol);
          if (next[0] !== current[0] || next[1] !== current[1]) {
            setCursor(next);
            soundEffects.playNav();
          }
        }

        // Action buttons
        if (isEdge(0)) {
          const [r, c] = cursorRef.current;
          const k = KEY_ROWS[r]?.[c];
          if (k) executeKeyRef.current(k);
        } else if (isEdge(1)) {
          soundEffects.playSelect();
          onCloseRef.current();
        } else if (isEdge(2)) {
          executeKeyRef.current({ label: "backspace", action: "backspace" });
        } else if (isEdge(3)) {
          executeKeyRef.current({ label: "space", action: "space" });
        } else if (isEdge(9)) {
          executeKeyRef.current({ label: "enter", action: "enter" });
        }

        prevButtons = gp.buttons.map((_, i) => isDown(i));
      }

      animId = requestAnimationFrame(pollGamepad);
    };

    animId = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(animId);
  }, [isOpen]);

  // Physical keyboard listener
  useEffect(() => {
    if (!isOpen) return;

    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      if (e.key === "Escape") {
        handled();
        soundEffects.playSelect();
        onClose();
      } else if (e.key === "Enter") {
        handled();
        soundEffects.playSelect();
        onSubmit();
      } else if (arrows[e.key]) {
        handled();
        const [dRow, dCol] = arrows[e.key];
        setCursor((current) => {
          const next = moveCursor(current, dRow, dCol);
          if (next[0] !== current[0] || next[1] !== current[1]) soundEffects.playNav();
          return next;
        });
      } else if (e.key === "Backspace") {
        handled();
        soundEffects.playSelect();
        onChange(value.slice(0, -1));
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        handled();
        soundEffects.playSelect();
        onChange(value + e.key.toUpperCase());
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isOpen, value, onChange, onSubmit, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center px-6 pt-8 omnis-fade-in"
      style={{
        // Dims only the top of the screen, so live search results stay visible below
        background: "linear-gradient(to bottom, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.55) 55%, rgba(0, 0, 0, 0.1) 100%)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[52rem] rounded-xl p-6 flex flex-col gap-5 shadow-2xl omnis-rise-in"
        style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}
      >
        {/* Search field */}
        <div className="flex items-center gap-4 h-14 px-5 rounded-md bg-black/35">
          <Search className="w-6 h-6 shrink-0 text-white/60" />
          <div className="flex-1 min-w-0 flex items-center overflow-hidden whitespace-nowrap text-xl font-medium">
            {value.length > 0 ? (
              <>
                <span className="truncate tracking-wide text-white">{value}</span>
                <span className="inline-block w-0.5 h-6 ml-1 bg-white animate-pulse shrink-0" />
              </>
            ) : (
              <span className="truncate text-white/40">{effectivePlaceholder}</span>
            )}
          </div>
          {resultCount !== undefined && value.length > 0 && (
            <span className="shrink-0 text-sm font-semibold uppercase tracking-wider text-white/55">
              {t("console_ui.results", { count: resultCount })}
            </span>
          )}
        </div>

        {/* Keys */}
        <div className="flex flex-col gap-2">
          {KEY_ROWS.map((row, rIdx) => (
            <div key={rIdx} className="flex gap-2">
              {row.map((key, cIdx) => {
                const isSelected = cursor[0] === rIdx && cursor[1] === cIdx;
                const icon = keyIcon(key);
                return (
                  <button
                    type="button"
                    key={`${rIdx}-${cIdx}`}
                    onClick={() => {
                      setCursor([rIdx, cIdx]);
                      executeKey(key);
                    }}
                    onMouseEnter={() => setCursor([rIdx, cIdx])}
                    className="h-12 min-w-0 rounded-md flex items-center justify-center gap-2 text-base font-semibold transition-[transform,background-color,color] duration-100"
                    style={{
                      flexGrow: key.grow ?? 1,
                      flexBasis: 0,
                      backgroundColor: isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.07)",
                      color: isSelected ? "#0b0f19" : "rgba(255, 255, 255, 0.9)",
                      transform: isSelected ? "scale(1.06)" : "none",
                    }}
                  >
                    {icon}
                    {icon ? <span className="truncate text-sm uppercase tracking-wider">{keyLabel(key)}</span> : keyLabel(key)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Controller hints */}
        <div className="flex items-center justify-end gap-6 text-sm font-semibold uppercase tracking-wider text-white/85">
          <span className="flex items-center gap-2">
            <Glyph kind="a" />
            {t("console_ui.kb_type")}
          </span>
          <span className="flex items-center gap-2">
            <Glyph kind="x" />
            {t("console_ui.kb_delete")}
          </span>
          <span className="flex items-center gap-2">
            <Glyph kind="y" />
            {t("console_ui.kb_space")}
          </span>
          <span className="flex items-center gap-2">
            <Glyph kind="menu" />
            {t("console_ui.kb_done")}
          </span>
          <span className="flex items-center gap-2">
            <Glyph kind="b" />
            {t("console_ui.back")}
          </span>
        </div>
      </div>
    </div>
  );
};

export default VirtualKeyboard;
