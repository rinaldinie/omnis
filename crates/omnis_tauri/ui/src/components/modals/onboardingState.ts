import { api } from "../../api";

/**
 * First-run wizard state, stored by the backend next to the library database (so each
 * data folder — portable ones included — has its own state) and cached here for the
 * synchronous checks done while loading the library.
 *
 * `null` = not loaded yet: the wizard is never shown before the real state is known.
 */
let completed: boolean | null = null;
/** "Skip for now": hidden until the next launch, without recording completion. */
let dismissedForSession = false;

/** Loads the first-run state from the backend. Call once at startup, before the library. */
export async function loadOnboardingState(): Promise<boolean> {
  try {
    completed = await api.games.getOnboardingCompleted();
  } catch (err) {
    console.warn("Failed to read first-run state:", err);
    completed = true; // never trap the user in the wizard because of a read error
  }
  return completed;
}

/** True when the first-run wizard is pending and was not put off for this session. */
export function shouldShowOnboarding(): boolean {
  return completed === false && !dismissedForSession;
}

/** "Skip for now": no wizard until the next launch (it comes back while the library is empty). */
export function dismissOnboardingForSession(): void {
  dismissedForSession = true;
}

/** Records that the wizard was completed, or dismissed for good. */
export async function markOnboardingCompleted(): Promise<void> {
  completed = true;
  try {
    await api.games.setOnboardingCompleted(true);
  } catch (err) {
    console.warn("Failed to save first-run state:", err);
  }
}

/** Test helper: forces the cached state. */
export function __setOnboardingStateForTests(value: boolean | null): void {
  completed = value;
  dismissedForSession = false;
}
