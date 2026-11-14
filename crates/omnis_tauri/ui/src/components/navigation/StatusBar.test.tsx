import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatusBar } from "./StatusBar";
import { I18nProvider } from "@/i18n";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { TranslateFn } from "@/types";

const t: TranslateFn = (key, params) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

describe("StatusBar metadata download indicator", () => {
  it("renders background metadata download progress on the bottom-left and triggers cancel", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <I18nProvider initialLocale="en">
        <TooltipProvider>
          <StatusBar
            gamepadConnected={false}
            activeGame={null}
            formatDuration={() => "00:00"}
            handleKillRunningGame={vi.fn()}
            isSyncing={false}
            statusMessage="Should not duplicate"
            achievementSync={null}
            metadataDownload={{
              status: "running",
              mode: "batch",
              current: 3,
              total: 10,
              title: "Hollow Knight",
            }}
            onCancelMetadataDownload={onCancel}
            currentThemeName="Default"
            t={t}
          />
        </TooltipProvider>
      </I18nProvider>
    );

    const footer = container.querySelector("footer");
    const leftGroup = footer?.children[0];
    const rightGroup = footer?.children[1];
    expect(leftGroup?.textContent).toContain("Metadata (3/10): Hollow Knight");
    expect(rightGroup?.textContent).not.toContain("Metadata (3/10): Hollow Knight");
    expect(screen.queryByText("Should not duplicate")).toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders metadata download alongside store sync on the bottom-left without duplication", () => {
    const { container } = render(
      <I18nProvider initialLocale="en">
        <TooltipProvider>
          <StatusBar
            gamepadConnected={false}
            activeGame={null}
            formatDuration={() => "00:00"}
            handleKillRunningGame={vi.fn()}
            isSyncing={true}
            statusMessage="Scanning Steam..."
            achievementSync={null}
            metadataDownload={{
              status: "running",
              mode: "batch",
              current: 2,
              total: 5,
              title: "Celeste",
            }}
            onCancelMetadataDownload={vi.fn()}
            currentThemeName="Default"
            t={t}
          />
        </TooltipProvider>
      </I18nProvider>
    );

    const footer = container.querySelector("footer");
    const leftGroup = footer?.children[0];
    expect(leftGroup?.textContent).toContain("Scanning Steam...");
    expect(leftGroup?.textContent).toContain("Metadata (2/5): Celeste");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("renders completion and cancellation states without cancel button", () => {
    const { rerender } = render(
      <I18nProvider initialLocale="en">
        <TooltipProvider>
          <StatusBar
            gamepadConnected={false}
            activeGame={null}
            formatDuration={() => "00:00"}
            handleKillRunningGame={vi.fn()}
            isSyncing={false}
            statusMessage=""
            achievementSync={null}
            metadataDownload={{
              status: "completed",
              mode: "batch",
              current: 10,
              total: 10,
              title: "",
            }}
            onCancelMetadataDownload={vi.fn()}
            currentThemeName="Default"
            t={t}
          />
        </TooltipProvider>
      </I18nProvider>
    );

    expect(screen.getByText("Metadata and posters updated!")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

    rerender(
      <I18nProvider initialLocale="en">
        <TooltipProvider>
          <StatusBar
            gamepadConnected={false}
            activeGame={null}
            formatDuration={() => "00:00"}
            handleKillRunningGame={vi.fn()}
            isSyncing={false}
            statusMessage=""
            achievementSync={null}
            metadataDownload={{
              status: "cancelled",
              mode: "batch",
              current: 3,
              total: 10,
              title: "",
            }}
            onCancelMetadataDownload={vi.fn()}
            currentThemeName="Default"
            t={t}
          />
        </TooltipProvider>
      </I18nProvider>
    );

    expect(screen.getByText("Metadata download cancelled")).toBeTruthy();
  });
});
