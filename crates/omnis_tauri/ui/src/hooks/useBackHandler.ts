import { useEffect, useRef } from "react";

/** Precedence tiers for console Back / Escape handling (highest wins). */
export const BACK_PRIORITY = {
  HOME_ZONE: 10,
  DETAILS: 20,
  MENU: 30,
  PAGE: 40,
  POWER_DIALOG: 50,
  CONFIRM_DIALOG: 60,
} as const;

interface BackEntry {
  id: number;
  priority: number;
  order: number;
  onBack: () => void;
}

const entries: BackEntry[] = [];
let nextId = 1;
let nextOrder = 1;
let listenerAttached = false;

function getTopBackEntry(): BackEntry | null {
  let top: BackEntry | null = null;
  for (const entry of entries) {
    if (!top || entry.priority > top.priority || (entry.priority === top.priority && entry.order > top.order)) {
      top = entry;
    }
  }
  return top;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

function hasUnmanagedTopModal(): boolean {
  return Boolean(
    document.querySelector(
      '[role="dialog"]:not([data-back-managed]), [role="alertdialog"]:not([data-back-managed]), [role="menu"]:not([data-back-managed]), [data-virtual-keyboard="true"]'
    )
  );
}

function isBackKeyEvent(e: KeyboardEvent): boolean {
  if (e.key === "Escape" || e.key === "Esc" || e.code === "Escape") return true;
  return e.key === "Backspace" && !e.ctrlKey && !e.altKey && !e.metaKey;
}

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (!isBackKeyEvent(e)) return;
  if (isEditableTarget(e.target)) return;
  if (hasUnmanagedTopModal()) return;

  const top = getTopBackEntry();
  if (!top) return;

  e.preventDefault();
  e.stopPropagation();
  top.onBack();
}

function syncGlobalListener() {
  if (typeof window === "undefined") return;
  if (entries.length > 0 && !listenerAttached) {
    // Capture phase guarantees back navigation runs before child stopPropagation or tooltip layers
    window.addEventListener("keydown", handleGlobalKeyDown, true);
    listenerAttached = true;
  } else if (entries.length === 0 && listenerAttached) {
    window.removeEventListener("keydown", handleGlobalKeyDown, true);
    listenerAttached = false;
  }
}

/** Triggers the highest-priority active back handler (used by gamepad B and tests). */
export function triggerTopBack(): boolean {
  const top = getTopBackEntry();
  if (!top) return false;
  top.onBack();
  return true;
}

/**
 * Registers a layer in the centralized Back / Escape stack while `enabled` is true.
 * Both keyboard Esc/Backspace and controller B unwind layers strictly from highest priority down.
 */
export function useBackHandler(enabled: boolean, onBack: () => void, priority: number): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!enabled) return;

    const entry: BackEntry = {
      id: nextId++,
      priority,
      order: nextOrder++,
      onBack: () => onBackRef.current(),
    };
    entries.push(entry);
    syncGlobalListener();

    return () => {
      const idx = entries.findIndex((item) => item.id === entry.id);
      if (idx !== -1) entries.splice(idx, 1);
      syncGlobalListener();
    };
  }, [enabled, priority]);
}
