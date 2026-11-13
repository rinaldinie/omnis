import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";
import { I18nProvider } from "@/i18n";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ThrowingComponent: React.FC<{ shouldThrow: boolean; message?: string }> = ({
  shouldThrow,
  message = "Boom!",
}) => {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div>Healthy content</div>;
};

describe("ErrorBoundary", () => {
  it("renders children when no error is thrown", () => {
    render(
      <I18nProvider initialLocale="en">
        <ErrorBoundary scope="TestScope">
          <div>Safe child</div>
        </ErrorBoundary>
      </I18nProvider>
    );

    expect(screen.getByText("Safe child")).toBeTruthy();
  });

  it("catches render error, displays localized fallback, and resets on retry", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onReset = vi.fn();

    const Wrapper: React.FC = () => {
      const [shouldThrow, setShouldThrow] = React.useState(true);
      return (
        <I18nProvider initialLocale="en">
          <ErrorBoundary
            scope="Catalog:details"
            variant="panel"
            onReset={() => {
              onReset();
              setShouldThrow(false);
            }}
          >
            <ThrowingComponent
              shouldThrow={shouldThrow}
              message="Details render failed"
            />
          </ErrorBoundary>
        </I18nProvider>
      );
    };

    render(<Wrapper />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("Catalog:details")).toBeTruthy();
    expect(screen.getByText("Details render failed")).toBeTruthy();
    expect(consoleSpy).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Healthy content")).toBeTruthy();
  });

  it("auto-resets when resetKeys change", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = render(
      <I18nProvider initialLocale="en">
        <ErrorBoundary scope="Catalog:stats" variant="panel" resetKeys={["stats", "g1"]}>
          <ThrowingComponent shouldThrow={true} message="Stats crash" />
        </ErrorBoundary>
      </I18nProvider>
    );

    expect(screen.getByText("Stats crash")).toBeTruthy();

    rerender(
      <I18nProvider initialLocale="en">
        <ErrorBoundary scope="Catalog:grid" variant="panel" resetKeys={["grid", "g1"]}>
          <ThrowingComponent shouldThrow={false} />
        </ErrorBoundary>
      </I18nProvider>
    );

    expect(screen.getByText("Healthy content")).toBeTruthy();
  });

  it("supports secondaryAction and silent/compact variants", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onSecondary = vi.fn();

    render(
      <I18nProvider initialLocale="it">
        <div>
          <ErrorBoundary
            scope="AppModals"
            variant="compact"
            secondaryAction={{ label: "Torna alla griglia", onClick: onSecondary }}
          >
            <ThrowingComponent shouldThrow={true} message="Modal failure" />
          </ErrorBoundary>
          <ErrorBoundary scope="Slot:hero" variant="silent">
            <ThrowingComponent shouldThrow={true} message="Slot failure" />
          </ErrorBoundary>
        </div>
      </I18nProvider>
    );

    expect(screen.getByText("Si è verificato un problema")).toBeTruthy();
    expect(screen.getByText("Modal failure")).toBeTruthy();
    expect(screen.queryByText("Slot failure")).toBeNull();

    const secondaryBtn = screen.getByRole("button", { name: "Torna alla griglia" });
    fireEvent.click(secondaryBtn);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });
});
