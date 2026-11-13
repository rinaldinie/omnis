import "@testing-library/react";

// Mock Tauri internals if needed
if (typeof window !== "undefined") {
  window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
}
