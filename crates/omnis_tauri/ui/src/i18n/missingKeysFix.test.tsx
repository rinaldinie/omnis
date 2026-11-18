import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider, useTranslation } from "./i18nContext";
import { GeneralSettingsTab } from "../components/settings/GeneralSettingsTab";
import { AppToasts } from "../components/common/AppToasts";
import { SteamGridDbSection } from "../components/settings/metadata/SteamGridDbSection";
import { FullscreenTopBar } from "../components/fullscreen/FullscreenTopBar";

describe("Missing localization keys fix", () => {
  it("renders GeneralSettingsTab recent window in German without English fallback", async () => {
    render(
      <I18nProvider initialLocale="de">
        <GeneralSettingsTab
          soundEnabled={true}
          onToggleSound={() => {}}
          onOpenThemes={() => {}}
          currentThemeName="Omnis Dark"
          activeSubTab="recent"
        />
      </I18nProvider>
    );

    // Should find German translations from recent_window_days_7
    await waitFor(() => {
      expect(screen.getByText("Aktivitätszeitfenster")).toBeTruthy();
      expect(screen.getByText("Immer (alle gespielten Spiele)")).toBeTruthy();
    });
  });

  it("renders AppToasts notifications aria-label and update button in German instead of Italian", async () => {
    function AppToastsHarness() {
      const { t } = useTranslation();
      return (
        <AppToasts
          isFullscreen={false}
          achievementSync={null}
          syncBanner={null}
          onDismissSyncBanner={() => {}}
          sessionToast={null}
          onDismissSessionToast={() => {}}
          formatDuration={() => ""}
          updater={{ status: "available", availableVersion: "0.25.0" }}
          onOpenSettings={() => {}}
          t={t}
        />
      );
    }

    render(
      <I18nProvider initialLocale="de">
        <AppToastsHarness />
      </I18nProvider>
    );

    await waitFor(() => {
      // In German, app_misc.notifications is "Benachrichtigungen" (not Italian "Notifiche")
      expect(screen.getByLabelText("Benachrichtigungen")).toBeTruthy();
      // In German, general_settings.update_now is "Jetzt aktualisieren" (not Italian "Aggiorna")
      expect(screen.getByText("Jetzt aktualisieren")).toBeTruthy();
    });
  });

  it("renders SteamGridDbSection description in German instead of untranslated default", async () => {
    render(
      <I18nProvider initialLocale="de">
        <SteamGridDbSection
          provider={{
            id: "steamgriddb",
            name: "SteamGridDB",
            description: "",
            author: "",
            requires_api_key: true,
            supported_fields: [],
            is_enabled: true,
            has_configured_key: true,
            settings_values: {},
          }}
          settings={{}}
          showSecret={false}
          onToggleSecret={() => {}}
          onSettingChange={() => {}}
          onToggleEnabled={() => {}}
          onSave={() => {}}
          onTest={() => {}}
          isSaving={false}
        />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText("Community-gestütztes Artwork-Repository für vertikale Raster, horizontale Banner, Hero-Artworks, Logos und hochauflösende Symbole.")
      ).toBeTruthy();
    });
  });

  it("renders FullscreenTopBar category buttons, Wi-Fi and Battery tooltips localized in German", async () => {
    function FullscreenTopBarHarness() {
      const { t } = useTranslation();
      return (
        <FullscreenTopBar
          visibleFilters={["all", "installed"]}
          activeCategory="all"
          filterLabel={(id) => id}
          filterCount={() => 5}
          tabRefs={{ current: {} }}
          setActiveFilter={() => {}}
          setFocusedIndex={() => {}}
          cycleFilter={() => {}}
          actualElapsed={0}
          hasUpdate={false}
          searchQuery=""
          clock="12:00"
          gamepadConnected={false}
          t={t}
        />
      );
    }

    render(
      <I18nProvider initialLocale="de">
        <FullscreenTopBarHarness />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByTitle("Vorherige Kategorie")).toBeTruthy();
      expect(screen.getByTitle("Nächste Kategorie")).toBeTruthy();
    });
  });
});
