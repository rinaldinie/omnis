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
});
