import { invoke } from "@tauri-apps/api/core";

/**
 * Opens an external web URL using the system's default browser.
 * In Tauri desktop apps, standard `<a target="_blank">` is intercepted or blocked by WebView2/WebKit.
 * This invokes the backend `open_external_url` command to launch the URL via the OS shell.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;

  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    console.warn("openExternalUrl only supports http and https URLs:", trimmed);
    return;
  }

  try {
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      await invoke("open_external_url", { url: trimmed });
      return;
    }
  } catch (err) {
    console.warn("Failed to open external URL via Tauri command:", err);
  }

  // Fallback for standard browser / dev environment
  try {
    window.open(trimmed, "_blank", "noopener,noreferrer");
  } catch (err) {
    console.warn("Failed to open external URL via window.open:", err);
  }
}
