import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { I18nProvider } from "@/i18n";
import { DisconnectStoreModal } from "./DisconnectStoreModal";
import ResetStatisticsModal from "../stats/ResetStatisticsModal";
import ThemeModal from "./ThemeModal";
import PluginManagerModal from "./PluginManagerModal";
import OnboardingModal from "./OnboardingModal";
import MetadataResolutionModal from "../MetadataResolutionModal";
import PlayniteImportModal from "./PlayniteImportModal";
import BatchEnrichModal from "./BatchEnrichModal";
import type { GameDto, MetadataPipelineConfig, ProviderInfo, ThemeConfig } from "@/types";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return {
    ...actual,
    listenTauri: vi.fn().mockResolvedValue(() => {}),
  };
});

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual,
    listenTauri: vi.fn().mockResolvedValue(() => {}),
    api: {
      ...actual.api,
      metadata: {
        ...actual.api?.metadata,
        searchCandidates: vi.fn().mockResolvedValue([]),
      },
    },
  };
});

const sampleTheme: ThemeConfig = {
  id: "epic_dark",
  name: "Epic Dark",
  description: "Dark sleek launcher theme",
  author: "Omnis",
  is_custom: false,
  bg_base: "#090c15",
  bg_surface: "#0f1422",
  bg_card: "#151b2e",
  text_primary: "#f8fafc",
  text_muted: "#94a3b8",
  accent_primary: "#6366f1",
  accent_glow: "rgba(99, 102, 241, 0.25)",
  border_color: "#1e293b",
  card_radius: "12px",
  font_family: "system-ui, sans-serif",
};

const sampleGame = {
  id: "g1",
  title: "Cyberpunk 2077",
  library: "steam",
  playtime_formatted: "40h",
  genres: ["RPG"],
} as unknown as GameDto;

const samplePipelineConfig: MetadataPipelineConfig = {
  provider_priority: ["steam", "igdb"],
  cover_source: "steam",
  background_source: "steam",
  score_source: "opencritic",
  details_source: "igdb",
  preserve_existing_artwork: true,
};

const sampleProviders: ProviderInfo[] = [
  {
    id: "steam",
    name: "Steam Store",
    description: "Official Steam provider",
    is_enabled: true,
    is_builtin: true,
    requires_api_key: false,
    has_configured_key: false,
    supported_fields: ["description", "cover"],
  } as ProviderInfo,
];

describe("Phase 5 Extended Modals Migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders DisconnectStoreModal with dialog role, Escape close, and confirms cleanup", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <I18nProvider initialLocale="en">
        <DisconnectStoreModal
          isOpen={true}
          storeId="steam"
          storeName="Steam"
          onClose={onClose}
          onConfirm={onConfirm}
        />
      </I18nProvider>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders ResetStatisticsModal and blocks Escape dismissal while resetting", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <I18nProvider initialLocale="en">
        <ResetStatisticsModal
          isOpen={true}
          resetOption="sessions"
          setResetOption={vi.fn()}
          resetting={true}
          onClose={onClose}
          onConfirm={vi.fn()}
        />
      </I18nProvider>
    );

    let dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <I18nProvider initialLocale="en">
        <ResetStatisticsModal
          isOpen={true}
          resetOption="sessions"
          setResetOption={vi.fn()}
          resetting={false}
          onClose={onClose}
          onConfirm={vi.fn()}
        />
      </I18nProvider>
    );
    dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders ThemeModal with Tabs and opens custom editor on tab switch", () => {
    const onClose = vi.fn();
    render(
      <I18nProvider initialLocale="en">
        <ThemeModal
          isOpen={true}
          onClose={onClose}
          themes={[sampleTheme]}
          currentTheme={sampleTheme}
          onSelectTheme={vi.fn()}
          onSaveCustomTheme={vi.fn().mockResolvedValue(undefined)}
          onOpenThemesFolder={vi.fn()}
        />
      </I18nProvider>
    );

    const dialog = screen.getByRole("dialog");
    expect(screen.getByText("Epic Dark")).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBe(2);
    fireEvent.mouseDown(tabs[1]);
    fireEvent.click(tabs[1]);
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders PluginManagerModal with Radix Tabs and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <I18nProvider initialLocale="en">
        <PluginManagerModal
          isOpen={true}
          onClose={onClose}
          providers={sampleProviders}
          pipelineConfig={samplePipelineConfig}
          setPipelineConfig={vi.fn()}
          editingSettings={{}}
          setEditingSettings={vi.fn()}
          showApiKey={{}}
          setShowApiKey={vi.fn()}
          testStatus={{}}
          isRefreshingPlugins={false}
          handleRefreshPlugins={vi.fn()}
          handleOpenFolder={vi.fn()}
          handleToggleProvider={vi.fn()}
          handleTestConnection={vi.fn()}
          handleSaveProviderSettings={vi.fn()}
          handleSavePipelineConfig={vi.fn()}
          gamesCount={10}
          gamesWithCoverCount={8}
          gamesWithScoreCount={6}
          pipelineProgress={null}
          isPipelineEnriching={false}
          handleRunMassivePipeline={vi.fn()}
          onPluginInstalled={vi.fn()}
        />
      </I18nProvider>
    );

    const dialog = screen.getByRole("dialog");
    expect(screen.getAllByRole("tab").length).toBeGreaterThanOrEqual(3);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders OnboardingModal inside Dialog and triggers onSkip on Escape", () => {
    const onSkip = vi.fn();
    render(
      <I18nProvider initialLocale="en">
        <OnboardingModal
          onComplete={vi.fn()}
          onSkip={onSkip}
          onLibraryImported={vi.fn()}
          onStartMetadataDownload={vi.fn()}
        />
      </I18nProvider>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("renders MetadataResolutionModal with dialog role and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <I18nProvider initialLocale="en">
        <MetadataResolutionModal
          isOpen={true}
          onClose={onClose}
          game={sampleGame}
          onApply={vi.fn()}
        />
      </I18nProvider>
    );

    const dialog = screen.getByRole("dialog");
    expect(screen.getByText(/Cyberpunk 2077/)).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders PlayniteImportModal with dialog role and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <I18nProvider initialLocale="en">
        <PlayniteImportModal isOpen={true} onClose={onClose} />
      </I18nProvider>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders BatchEnrichModal with dialog role and closes on Escape when idle", () => {
    const onClose = vi.fn();
    render(
      <I18nProvider initialLocale="en">
        <BatchEnrichModal
          isOpen={true}
          onClose={onClose}
          allGames={[sampleGame]}
          filteredGames={[sampleGame]}
          onComplete={vi.fn().mockResolvedValue(undefined)}
        />
      </I18nProvider>
    );

    const dialog = screen.getByRole("dialog");
    expect(screen.getByText("Cyberpunk 2077")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
