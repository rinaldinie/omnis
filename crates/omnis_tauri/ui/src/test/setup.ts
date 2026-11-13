import "@testing-library/react";

// Minimal Tauri v2 runtime internals so @tauri-apps/api/event listeners and callbacks
// work deterministically in Happy-DOM tests without noisy transformCallback errors.
if (typeof window !== "undefined") {
  let nextCallbackId = 1;
  let nextListenerId = 1;
  const callbacks = new Map<number, (data: unknown) => void>();

  const existing = (window.__TAURI_INTERNALS__ ?? {}) as Record<string, unknown>;
  const win = window as Window & {
    __TAURI_EVENT_PLUGIN_INTERNALS__?: { unregisterListener: (event: string, eventId: number) => void };
  };

  win.__TAURI_EVENT_PLUGIN_INTERNALS__ = win.__TAURI_EVENT_PLUGIN_INTERNALS__ ?? {
    unregisterListener: () => {},
  };

  window.__TAURI_INTERNALS__ = {
    ...existing,
    transformCallback:
      typeof existing.transformCallback === "function"
        ? existing.transformCallback
        : (callback?: (data: unknown) => void, once = false) => {
            const id = nextCallbackId++;
            if (callback) {
              callbacks.set(id, (data) => {
                if (once) callbacks.delete(id);
                callback(data);
              });
            }
            return id;
          },
    unregisterCallback:
      typeof existing.unregisterCallback === "function"
        ? existing.unregisterCallback
        : (id: number) => {
            callbacks.delete(id);
          },
    invoke:
      typeof existing.invoke === "function"
        ? existing.invoke
        : async (cmd: string) => {
            if (cmd === "plugin:event|listen") {
              return nextListenerId++;
            }
            if (cmd === "plugin:event|unlisten") {
              return undefined;
            }
            throw new Error(`Unmocked Tauri command '${cmd}'`);
          },
  };
}
