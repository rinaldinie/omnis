import React, { useState, useEffect, useRef } from "react";
import {
  Keyboard as KeyboardIcon,
  Search,
  X,
  CornerDownLeft,
  Delete,
  Space,
  Trash2,
  Gamepad2,
} from "lucide-react";
import soundEffects from "../utils/soundEffects";
import { useTranslation } from "../i18n";

export interface VirtualKeyboardProps {
  isOpen: boolean;
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  placeholder?: string;
}

interface KeyDef {
  label: string;
  action: "char" | "backspace" | "enter" | "space" | "clear" | "close";
  char?: string;
  icon?: React.ReactNode;
  widthClass?: string;
}

const ROW_0: KeyDef[] = [
  { label: "1", char: "1", action: "char" },
  { label: "2", char: "2", action: "char" },
  { label: "3", char: "3", action: "char" },
  { label: "4", char: "4", action: "char" },
  { label: "5", char: "5", action: "char" },
  { label: "6", char: "6", action: "char" },
  { label: "7", char: "7", action: "char" },
  { label: "8", char: "8", action: "char" },
  { label: "9", char: "9", action: "char" },
  { label: "0", char: "0", action: "char" },
  {
    label: "Canc",
    action: "backspace",
    icon: <Delete className="w-4 h-4" />,
    widthClass: "flex-[1.4]",
  },
];

const ROW_1: KeyDef[] = [
  { label: "Q", char: "Q", action: "char" },
  { label: "W", char: "W", action: "char" },
  { label: "E", char: "E", action: "char" },
  { label: "R", char: "R", action: "char" },
  { label: "T", char: "T", action: "char" },
  { label: "Y", char: "Y", action: "char" },
  { label: "U", char: "U", action: "char" },
  { label: "I", char: "I", action: "char" },
  { label: "O", char: "O", action: "char" },
  { label: "P", char: "P", action: "char" },
];

const ROW_2: KeyDef[] = [
  { label: "A", char: "A", action: "char" },
  { label: "S", char: "S", action: "char" },
  { label: "D", char: "D", action: "char" },
  { label: "F", char: "F", action: "char" },
  { label: "G", char: "G", action: "char" },
  { label: "H", char: "H", action: "char" },
  { label: "J", char: "J", action: "char" },
  { label: "K", char: "K", action: "char" },
  { label: "L", char: "L", action: "char" },
];

const ROW_3: KeyDef[] = [
  { label: "Z", char: "Z", action: "char" },
  { label: "X", char: "X", action: "char" },
  { label: "C", char: "C", action: "char" },
  { label: "V", char: "V", action: "char" },
  { label: "B", char: "B", action: "char" },
  { label: "N", char: "N", action: "char" },
  { label: "M", char: "M", action: "char" },
  { label: "-", char: "-", action: "char" },
  { label: ".", char: ".", action: "char" },
];

const ROW_4: KeyDef[] = [
  {
    label: "Spazio",
    action: "space",
    icon: <Space className="w-4 h-4" />,
    widthClass: "flex-[3]",
  },
  {
    label: "Cancella",
    action: "clear",
    icon: <Trash2 className="w-4 h-4" />,
    widthClass: "flex-[1.5]",
  },
  {
    label: "Cerca",
    action: "enter",
    icon: <CornerDownLeft className="w-4 h-4" />,
    widthClass: "flex-[1.8]",
  },
  {
    label: "Chiudi (B)",
    action: "close",
    icon: <X className="w-4 h-4" />,
    widthClass: "flex-[1.5]",
  },
];

const KEY_ROWS: KeyDef[][] = [ROW_0, ROW_1, ROW_2, ROW_3, ROW_4];

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  isOpen,
  value,
  onChange,
  onSubmit,
  onClose,
  placeholder,
}) => {
  const { t } = useTranslation();
  const effectivePlaceholder = placeholder || t('topbar.search_placeholder');
  // Cursor position in [row, col]
  const [cursor, setCursor] = useState<[number, number]>([1, 0]); // Start on 'Q'
  const lastGamepadNav = useRef<number>(0);
  const lastGamepadAction = useRef<number>(0);

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

  // Execute a key action
  const executeKey = (key: KeyDef) => {
    soundEffects.playSelect();
    switch (key.action) {
      case "char":
        if (key.char) {
          onChangeRef.current(valueRef.current + key.char);
        }
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
      case "close":
        onCloseRef.current();
        break;
    }
  };

  // Gamepad Polling Loop
  useEffect(() => {
    if (!isOpen) return;

    let animId: number;

    const pollGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      let activeGamepad: Gamepad | null = null;
      for (const gp of gamepads) {
        if (gp && gp.connected) {
          activeGamepad = gp;
          break;
        }
      }

      if (activeGamepad) {
        const now = Date.now();
        const b = activeGamepad.buttons;
        const a = activeGamepad.axes;

        // Navigation (D-Pad or Left Stick)
        if (now - lastGamepadNav.current > 170) {
          const isLeft = b[14]?.pressed || (a[0] && a[0] < -0.45);
          const isRight = b[15]?.pressed || (a[0] && a[0] > 0.45);
          const isUp = b[12]?.pressed || (a[1] && a[1] < -0.45);
          const isDown = b[13]?.pressed || (a[1] && a[1] > 0.45);

          const [currRow, currCol] = cursorRef.current;

          if (isLeft) {
            const nextCol = Math.max(0, currCol - 1);
            if (nextCol !== currCol) {
              setCursor([currRow, nextCol]);
              soundEffects.playNav();
            }
            lastGamepadNav.current = now;
          } else if (isRight) {
            const maxCol = KEY_ROWS[currRow].length - 1;
            const nextCol = Math.min(maxCol, currCol + 1);
            if (nextCol !== currCol) {
              setCursor([currRow, nextCol]);
              soundEffects.playNav();
            }
            lastGamepadNav.current = now;
          } else if (isUp) {
            const nextRow = Math.max(0, currRow - 1);
            if (nextRow !== currRow) {
              const targetCols = KEY_ROWS[nextRow].length;
              const currCols = KEY_ROWS[currRow].length;
              const scaledCol = Math.min(
                targetCols - 1,
                Math.round((currCol / Math.max(1, currCols - 1)) * (targetCols - 1))
              );
              setCursor([nextRow, scaledCol]);
              soundEffects.playNav();
            }
            lastGamepadNav.current = now;
          } else if (isDown) {
            const nextRow = Math.min(KEY_ROWS.length - 1, currRow + 1);
            if (nextRow !== currRow) {
              const targetCols = KEY_ROWS[nextRow].length;
              const currCols = KEY_ROWS[currRow].length;
              const scaledCol = Math.min(
                targetCols - 1,
                Math.round((currCol / Math.max(1, currCols - 1)) * (targetCols - 1))
              );
              setCursor([nextRow, scaledCol]);
              soundEffects.playNav();
            }
            lastGamepadNav.current = now;
          }
        }

        // Action Buttons
        if (now - lastGamepadAction.current > 220) {
          const btnA = b[0]?.pressed; // Confirm / Type active key
          const btnB = b[1]?.pressed; // Close
          const btnX = b[2]?.pressed; // Backspace shortcut
          const btnY = b[3]?.pressed; // Space shortcut
          const btnStart = b[9]?.pressed; // Submit / Enter

          if (btnA) {
            const [r, c] = cursorRef.current;
            const key = KEY_ROWS[r]?.[c];
            if (key) {
              executeKey(key);
            }
            lastGamepadAction.current = now + 50;
          } else if (btnB) {
            soundEffects.playSelect();
            onCloseRef.current();
            lastGamepadAction.current = now + 150;
          } else if (btnX) {
            soundEffects.playSelect();
            onChangeRef.current(valueRef.current.slice(0, -1));
            lastGamepadAction.current = now;
          } else if (btnY) {
            soundEffects.playSelect();
            onChangeRef.current(valueRef.current + " ");
            lastGamepadAction.current = now;
          } else if (btnStart) {
            soundEffects.playSelect();
            onSubmitRef.current();
            lastGamepadAction.current = now + 150;
          }
        }
      }

      animId = requestAnimationFrame(pollGamepad);
    };

    animId = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(animId);
  }, [isOpen]);

  // Physical Keyboard Listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        soundEffects.playSelect();
        onClose();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        soundEffects.playSelect();
        onSubmit();
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        setCursor(([r, c]) => {
          const next = Math.max(0, c - 1);
          if (next !== c) soundEffects.playNav();
          return [r, next];
        });
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        setCursor(([r, c]) => {
          const max = KEY_ROWS[r].length - 1;
          const next = Math.min(max, c + 1);
          if (next !== c) soundEffects.playNav();
          return [r, next];
        });
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setCursor(([r, c]) => {
          const nextR = Math.max(0, r - 1);
          if (nextR !== r) {
            soundEffects.playNav();
            const targetCols = KEY_ROWS[nextR].length;
            const currCols = KEY_ROWS[r].length;
            const scaled = Math.min(
              targetCols - 1,
              Math.round((c / Math.max(1, currCols - 1)) * (targetCols - 1))
            );
            return [nextR, scaled];
          }
          return [r, c];
        });
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setCursor(([r, c]) => {
          const nextR = Math.min(KEY_ROWS.length - 1, r + 1);
          if (nextR !== r) {
            soundEffects.playNav();
            const targetCols = KEY_ROWS[nextR].length;
            const currCols = KEY_ROWS[r].length;
            const scaled = Math.min(
              targetCols - 1,
              Math.round((c / Math.max(1, currCols - 1)) * (targetCols - 1))
            );
            return [nextR, scaled];
          }
          return [r, c];
        });
        return;
      }

      if (e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        soundEffects.playSelect();
        onChange(value.slice(0, -1));
        return;
      }

      // Typing printable character
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        soundEffects.playSelect();
        onChange(value + e.key.toUpperCase());
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isOpen, value, onChange, onSubmit, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-end pb-8 px-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="relative max-w-4xl w-full rounded-3xl border p-6 md:p-8 space-y-6 shadow-2xl backdrop-blur-xl"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
          boxShadow: `0 20px 50px rgba(0,0,0,0.8), 0 0 40px var(--accent-glow)`,
        }}
      >
        {/* TOP HEADER: TITLE & SEARCH INPUT PREVIEW */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-white/80">
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-md"
                style={{ backgroundColor: "var(--accent-primary)" }}
              >
                <KeyboardIcon className="w-4 h-4" />
              </div>
              <span className="tracking-wider uppercase font-black text-sm text-white">
                Tastiera a Schermo Fullscreen
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Gamepad2 className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>Controller Attivo</span>
            </div>
          </div>

          {/* TEXT PREVIEW BAR */}
          <div
            className="flex items-center gap-3 px-5 py-4 rounded-2xl border text-lg md:text-xl font-bold text-white transition-all shadow-inner"
            style={{
              backgroundColor: "var(--bg-base)",
              borderColor: "var(--border-color)",
            }}
          >
            <Search className="w-6 h-6 shrink-0" style={{ color: "var(--accent-primary)" }} />
            <div className="flex-1 flex items-center overflow-x-auto whitespace-nowrap scrollbar-none">
              {value.length > 0 ? (
                <>
                  <span className="tracking-wider">{value}</span>
                  <span
                    className="inline-block w-0.5 h-6 ml-1 animate-pulse"
                    style={{ backgroundColor: "var(--accent-primary)" }}
                  />
                </>
              ) : (
                <span className="text-slate-500 font-normal italic select-none">
                  {effectivePlaceholder}
                </span>
              )}
            </div>

            {value.length > 0 && (
              <button
                onClick={() => {
                  soundEffects.playSelect();
                  onChange("");
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                title="Cancella tutto"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* 2D VIRTUAL KEYBOARD MATRIX */}
        <div className="space-y-2.5 select-none">
          {KEY_ROWS.map((row, rIdx) => (
            <div key={rIdx} className="flex items-center gap-2 md:gap-2.5 w-full">
              {row.map((key, cIdx) => {
                const isSelected = cursor[0] === rIdx && cursor[1] === cIdx;
                let displayLabel = key.label;
                if (key.action === "backspace") displayLabel = t('common.delete');
                else if (key.action === "clear") displayLabel = t('common.delete');
                else if (key.action === "close") displayLabel = `${t('common.close')} (B)`;

                return (
                  <button
                    key={`${rIdx}-${cIdx}`}
                    onClick={() => {
                      setCursor([rIdx, cIdx]);
                      executeKey(key);
                    }}
                    onMouseEnter={() => {
                      if (cursor[0] !== rIdx || cursor[1] !== cIdx) {
                        setCursor([rIdx, cIdx]);
                        soundEffects.playNav();
                      }
                    }}
                    className={`flex-1 min-h-[50px] md:min-h-[56px] rounded-xl flex items-center justify-center gap-2 text-sm md:text-base font-extrabold transition-all duration-150 transform ${
                      key.widthClass || ""
                    } ${
                      isSelected
                        ? "scale-105 z-20 text-white shadow-2xl ring-4 ring-white/30"
                        : "text-slate-200 hover:text-white hover:bg-white/20 hover:border-white/40 border opacity-90 hover:opacity-100"
                    }`}
                    style={{
                      backgroundColor: isSelected
                        ? "var(--accent-primary)"
                        : "var(--bg-card)",
                      borderColor: isSelected
                        ? "var(--accent-primary)"
                        : "var(--border-color)",
                      boxShadow: isSelected
                        ? `0 0 25px var(--accent-glow), inset 0 1px 1px rgba(255,255,255,0.4)`
                        : undefined,
                    }}
                  >
                    {key.icon}
                    <span>{displayLabel}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* CONTROLLER ACTION HINTS FOOTER */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t text-xs font-bold"
          style={{
            borderColor: "var(--border-color)",
            color: "var(--text-muted)",
          }}
        >
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5">
              <kbd className="w-5 h-5 rounded-full bg-black/40 border border-white/20 flex items-center justify-center text-[10px] text-white">
                A
              </kbd>
              <span>Digita</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="w-5 h-5 rounded-full bg-black/40 border border-white/20 flex items-center justify-center text-[10px] text-white">
                X
              </kbd>
              <span>Cancella</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="w-5 h-5 rounded-full bg-black/40 border border-white/20 flex items-center justify-center text-[10px] text-white">
                Y
              </kbd>
              <span>Spazio</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 h-5 rounded bg-black/40 border border-white/20 flex items-center justify-center text-[10px] text-white font-mono">
                Start
              </kbd>
              <span>Conferma</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="w-5 h-5 rounded-full bg-black/40 border border-white/20 flex items-center justify-center text-[10px] text-white">
                B
              </kbd>
              <span>{t('common.close')}</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                soundEffects.playSelect();
                onClose();
              }}
              className="px-4 py-2 rounded-xl border text-xs font-bold hover:bg-white/10 transition-colors"
              style={{
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              {t('common.cancel')} (Esc)
            </button>
            <button
              onClick={() => {
                soundEffects.playSelect();
                onSubmit();
              }}
              className="px-6 py-2 rounded-xl text-xs font-black text-white shadow-lg transition-all hover:brightness-110 active:opacity-90"
              style={{
                backgroundColor: "var(--accent-primary)",
                boxShadow: `0 0 15px var(--accent-glow)`,
              }}
            >
              {t('common.search')} (↵)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VirtualKeyboard;
