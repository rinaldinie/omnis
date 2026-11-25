import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider, loadLocale, useTranslation } from "./i18nContext";

function LocaleHarness() {
  const { locale, setLocale, t } = useTranslation();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="save-label">{t("common.save")}</span>
      <button type="button" onClick={() => setLocale("fr")}>
        switch-fr
      </button>
    </div>
  );
}

describe("i18nContext lazy locale loading", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads es dynamically via loadLocale and keeps it/en synchronous", async () => {
    render(
      <I18nProvider initialLocale="en">
        <LocaleHarness />
      </I18nProvider>
    );

    expect(screen.getByTestId("save-label").textContent).toBe("Save");

    const esDict = await loadLocale("es");
    expect(esDict?.common.save).toBe("Guardar");
  });

  it("loads lazy initialLocale asynchronously with synchronous fallback first", async () => {
    render(
      <I18nProvider initialLocale="de">
        <LocaleHarness />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("save-label").textContent).toBe("Speichern");
    });
  });

  it("switches to a lazy locale via setLocale and persists preference", async () => {
    render(
      <I18nProvider initialLocale="it">
        <LocaleHarness />
      </I18nProvider>
    );

    expect(screen.getByTestId("save-label").textContent).toBe("Salva");

    fireEvent.click(screen.getByRole("button", { name: "switch-fr" }));

    await waitFor(() => {
      expect(screen.getByTestId("locale").textContent).toBe("fr");
      expect(screen.getByTestId("save-label").textContent).toBe("Enregistrer");
    });
    expect(localStorage.getItem("omnis_language")).toBe("fr");
  });

  it("defines previously missing keys across all 6 supported locales", async () => {
    const localeCodes = ["it", "en", "de", "es", "fr", "ja"] as const;
    for (const code of localeCodes) {
      const dict = code === "it" ? (await import("./locales/it")).it :
                   code === "en" ? (await import("./locales/en")).en :
                   await loadLocale(code);

      expect(dict, `Locale ${code} failed to load`).toBeDefined();
      if (!dict) continue;

      // general_settings: recent_window_days_7 ... 90 and recent_window_7d ... 90d aliases
      expect(dict.general_settings?.recent_window_days_7, `recent_window_days_7 missing in ${code}`).toBeTruthy();
      expect(dict.general_settings?.recent_window_days_14, `recent_window_days_14 missing in ${code}`).toBeTruthy();
      expect(dict.general_settings?.recent_window_days_30, `recent_window_days_30 missing in ${code}`).toBeTruthy();
      expect(dict.general_settings?.recent_window_days_60, `recent_window_days_60 missing in ${code}`).toBeTruthy();
      expect(dict.general_settings?.recent_window_days_90, `recent_window_days_90 missing in ${code}`).toBeTruthy();
      expect(dict.general_settings?.recent_window_7d, `recent_window_7d missing in ${code}`).toBeTruthy();
      expect(dict.general_settings?.recent_window_90d, `recent_window_90d missing in ${code}`).toBeTruthy();

      // general_settings: update_now
      expect(dict.general_settings?.update_now, `update_now missing in ${code}`).toBeTruthy();

      // app_misc: notifications
      expect(dict.app_misc?.notifications, `notifications missing in ${code}`).toBeTruthy();

      // metadata_settings: steamgriddb_desc
      expect(dict.metadata_settings?.steamgriddb_desc, `steamgriddb_desc missing in ${code}`).toBeTruthy();

      // console_ui: category navigation, wifi and battery status
      expect(dict.console_ui?.category_prev, `category_prev missing in ${code}`).toBeTruthy();
      expect(dict.console_ui?.category_next, `category_next missing in ${code}`).toBeTruthy();
      expect(dict.console_ui?.wifi_disconnected, `wifi_disconnected missing in ${code}`).toBeTruthy();
      expect(dict.console_ui?.charging_percent, `charging_percent missing in ${code}`).toBeTruthy();
      expect(dict.console_ui?.battery_percent, `battery_percent missing in ${code}`).toBeTruthy();

      // bug_report: core strings present across all locales
      expect(dict.topbar?.report_bug, `topbar.report_bug missing in ${code}`).toBeTruthy();
      expect(dict.error_boundary?.report_bug, `error_boundary.report_bug missing in ${code}`).toBeTruthy();
      expect(dict.bug_report?.modal_title, `bug_report.modal_title missing in ${code}`).toBeTruthy();
      expect(dict.bug_report?.submit_github, `bug_report.submit_github missing in ${code}`).toBeTruthy();
    }
  });
});
