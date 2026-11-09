import "@testing-library/react";

// Mock Tauri internals if needed
if (typeof window !== "undefined") {
  (window as any).__TAURI_INTERNALS__ = (window as any).__TAURI_INTERNALS__ || {};
}
