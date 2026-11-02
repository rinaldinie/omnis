import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * Standard typed IPC invocation.
 * Unlike legacy `invokeTauri`, this throws meaningful errors so callers can handle or display failures.
 */
export async function invokeIpc<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[IPC Error] Command '${cmd}' failed:`, err);
    throw new Error(`Command '${cmd}' failed: ${message}`, { cause: err });
  }
}

/**
 * Safe IPC invocation returning a Result tuple without throwing.
 */
export async function safeInvokeIpc<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<{ data: T; error: null } | { data: null; error: Error }> {
  try {
    const data = await invoke<T>(cmd, args);
    return { data, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[IPC Error] Command '${cmd}' failed:`, error);
    return { data: null, error };
  }
}

/**
 * Backward-compatible helper for legacy components that expect `Promise<T | null>`.
 */
export async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.warn(`[IPC Warning] Command '${cmd}' failed or not available:`, err);
    return null;
  }
}

/**
 * Typed Tauri event listener.
 */
export async function listenIpc<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  return await listen<T>(event, (e) => handler(e.payload));
}

/**
 * Backward-compatible event listener helper.
 */
export async function listenTauri<T>(
  event: string,
  handler: (payload: T) => void
): Promise<(() => void) | null> {
  try {
    return await listen<T>(event, (e) => handler(e.payload));
  } catch (err) {
    console.warn(`[IPC Warning] Event listener '${event}' failed:`, err);
    return null;
  }
}
