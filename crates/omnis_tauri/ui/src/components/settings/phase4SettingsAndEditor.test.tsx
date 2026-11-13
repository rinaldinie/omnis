import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { I18nProvider } from "@/i18n";
import { ToggleSwitch } from "./SettingsControls";
import { SettingsModal } from "./SettingsModal";
import GameEditorModal from "../GameEditorModal";
import type { GameDto } from "@/types";

const mockGetGame = vi.fn();
const mockUpdateGameMetadata = vi.fn();
const mockAllowMediaFile = vi.fn();

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual,
    listenTauri: vi.fn().mockResolvedValue(() => {}),
    api: {
      ...actual.api,
      window: {
        ...actual.api?.window,
        setMinimizeToTray: vi.fn().mockResolvedValue(undefined),
      },
      stores: {
        ...actual.api?.stores,
        getStoreAccounts: vi.fn().mockResolvedValue([]),
      },
      metadata: {
        ...actual.api?.metadata,
        getProviders: vi.fn().mockResolvedValue([]),
      },
      games: {
        ...actual.api?.games,
        getGame: (...args: unknown[]) => mockGetGame(...args),
        updateGameMetadata: (...args: unknown[]) => mockUpdateGameMetadata(...args),
        allowMediaFile: (...args: unknown[]) => mockAllowMediaFile(...args),
        pickExecutableFile: vi.fn().mockResolvedValue(null),
        resolveExecutablePath: vi.fn().mockResolvedValue(null),
        pickDirectory: vi.fn().mockResolvedValue(null),
        pickImageFile: vi.fn().mockResolvedValue(null),
      },
    },
  };
});

vi.mock("../../hooks/useAppUpdater", () => ({
  useUpdater: () => ({
    status: "idle",
    updateInfo: null,
    error: null,
    progress: 0,
    checkForUpdates: vi.fn(),
    downloadAndInstall: vi.fn(),
    dismissUpdate: vi.fn(),
  }),
}));

const mockGame = {
  id: "game-1",
  title: "Hollow Knight",
  library: "steam",
  genres: ["Metroidvania"],
  developers: ["Team Cherry"],
  publishers: ["Team Cherry"],
  tags: ["Indie"],
  description: "Explore Hallownest.",
  play_actions: [],
  custom_links: [],
} as unknown as GameDto;

describe("Phase 4 Settings & Complex Modals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof globalThis.ResizeObserver === "undefined") {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    }
    mockGetGame.mockResolvedValue(mockGame);
    mockAllowMediaFile.mockResolvedValue(undefined);
    mockUpdateGameMetadata.mockResolvedValue(mockGame);
  });

  it("renders ToggleSwitch via Radix Switch with sm size and invokes onChange", () => {
    const onChange = vi.fn();
    render(
      <ToggleSwitch
        checked={false}
        onChange={onChange}
        size="sm"
        ariaLabel="Enable sync"
      />
    );

    const toggle = screen.getByRole("switch", { name: "Enable sync" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.className).toContain("w-7");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("SettingsModal clears active search on first Escape and closes on second Escape", async () => {
    const onClose = vi.fn();
    render(
      <I18nProvider initialLocale="it">
        <SettingsModal
          isOpen={true}
          onClose={onClose}
          soundEnabled={true}
          onToggleSound={vi.fn()}
          onOpenThemes={vi.fn()}
          currentThemeName="Cyberpunk"
          initialTab="general"
        />
      </I18nProvider>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();

    const searchInput = screen.getByPlaceholderText("Cerca impostazioni...") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "Cyber" } });
    expect(searchInput.value).toBe("Cyber");

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(searchInput.value).toBe("");
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("GameEditorModal opens with Radix Tabs, switches tabs, and blocks close while saving", async () => {
    let resolveSave!: (value: GameDto) => void;
    mockUpdateGameMetadata.mockImplementation(
      () =>
        new Promise<GameDto>((resolve) => {
          resolveSave = resolve;
        })
    );

    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <I18nProvider initialLocale="en">
        <GameEditorModal
          isOpen={true}
          onClose={onClose}
          game={mockGame}
          onSave={onSave}
        />
      </I18nProvider>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    await waitFor(() => expect(mockGetGame).toHaveBeenCalledWith("game-1"));

    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBe(5);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");

    // Switch to Description tab via Radix pointer/click interaction
    fireEvent.mouseDown(tabs[1], { button: 0 });
    fireEvent.click(tabs[1]);
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByDisplayValue("Explore Hallownest.")).toBeTruthy();

    // Trigger Save and verify close is blocked while saving is in progress
    const saveButton = screen.getByRole("button", { name: /save changes/i });
    fireEvent.click(saveButton);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    resolveSave(mockGame);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(mockGame));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
