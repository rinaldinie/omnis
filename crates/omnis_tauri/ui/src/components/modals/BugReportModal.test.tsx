import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { I18nProvider } from "@/i18n";
import BugReportModal from "./BugReportModal";
import { api } from "../../api";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      bugReport: {
        getContext: vi.fn(),
        openGitHubBugReport: vi.fn(),
      },
      window: {
        ...actual.api.window,
        openFolder: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
});

describe("BugReportModal", () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
    });
    vi.mocked(api.bugReport.getContext).mockResolvedValue({
      app_version: "v0.28.0",
      os_info: "Windows 11 (x86_64)",
      logs_excerpt: "2026-11-25 ERROR sample sanitized log",
      log_file_name: "omnis-2026-11-25.log",
    });
    vi.mocked(api.bugReport.openGitHubBugReport).mockResolvedValue({
      url: "https://github.com/rinaldinie/omnis/issues/new?template=bug_report.yml",
      logs_truncated: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("loads diagnostic context and submits pre-filled GitHub report", async () => {
    render(
      <I18nProvider initialLocale="en">
        <BugReportModal isOpen={true} onClose={vi.fn()} />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Windows 11 (x86_64)")).toBeTruthy();
      expect(screen.getByDisplayValue("v0.28.0")).toBeTruthy();
      expect(screen.getByText(/sample sanitized log/)).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("Short summary of the bug..."), {
      target: { value: "Crash when launching game" },
    });
    fireEvent.change(screen.getByPlaceholderText("Clear and concise description of what happened..."), {
      target: { value: "Clicking play causes crash" },
    });
    fireEvent.change(screen.getByPlaceholderText(/1\. Go to/), {
      target: { value: "1. Select game\n2. Click Play" },
    });
    fireEvent.change(screen.getByPlaceholderText("What you expected to happen..."), {
      target: { value: "Game starts" },
    });
    fireEvent.change(screen.getByPlaceholderText("What actually happened instead..."), {
      target: { value: "Nothing happens" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Open pre-filled GitHub Issue/i }));

    await waitFor(() => {
      expect(api.bugReport.openGitHubBugReport).toHaveBeenCalledWith({
        title: "Crash when launching game",
        description: "Clicking play causes crash",
        reproduction: "1. Select game\n2. Click Play",
        expected: "Game starts",
        actual: "Nothing happens",
        area: "UI / UX",
        os: "Windows 11 (x86_64)",
        version: "v0.28.0",
        logs: "2026-11-25 ERROR sample sanitized log",
      });
    });

    expect(await screen.findByText(/GitHub issue page opened in your browser/)).toBeTruthy();
  });

  it("copies full logs to clipboard when backend reports URL truncation", async () => {
    vi.mocked(api.bugReport.openGitHubBugReport).mockResolvedValue({
      url: "https://github.com/rinaldinie/omnis/issues/new?template=bug_report.yml",
      logs_truncated: true,
    });

    render(
      <I18nProvider initialLocale="en">
        <BugReportModal
          isOpen={true}
          onClose={vi.fn()}
          prefill={{
            title: "Prefilled crash",
            description: "Boundary caught error",
            reproduction: "1. Open details",
            expected: "Details show",
            actual: "Error boundary appeared",
            area: "UI / UX",
            extraLogs: "TypeError: boom",
          }}
        />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/TypeError: boom/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Open pre-filled GitHub Issue/i }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        "[UI Error Details]\nTypeError: boom\n\n2026-11-25 ERROR sample sanitized log"
      );
      expect(screen.getByText(/copied to your clipboard/)).toBeTruthy();
    });
  });

  it("omits logs when user unchecks include_logs", async () => {
    render(
      <I18nProvider initialLocale="en">
        <BugReportModal
          isOpen={true}
          onClose={vi.fn()}
          prefill={{
            title: "No logs issue",
            description: "desc",
            reproduction: "steps",
            expected: "exp",
            actual: "act",
          }}
        />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/sample sanitized log/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Open pre-filled GitHub Issue/i }));

    await waitFor(() => {
      expect(api.bugReport.openGitHubBugReport).toHaveBeenCalledWith(
        expect.objectContaining({
          logs: undefined,
        })
      );
    });
  });
});
