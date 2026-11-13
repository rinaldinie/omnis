import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { I18nProvider } from "../../../i18n/i18nContext";
import { SettingsSidebar } from "./SettingsSidebar";
import { TreeGroup } from "./settingsTreeConfig";

const renderSidebar = (ui: React.ReactElement) =>
  render(
    <I18nProvider initialLocale="it">
      {ui}
    </I18nProvider>
  );

const mockGroups: TreeGroup[] = [
  {
    id: "general",
    label: "Generale",
    icon: () => <span data-testid="icon-general" />,
    items: [
      {
        id: "general-language",
        label: "Lingua & Localizzazione",
        icon: () => <span data-testid="icon-language" />,
        keywords: ["lingua", "language"],
      },
      {
        id: "general-audio",
        label: "Audio & Feedback",
        icon: () => <span data-testid="icon-audio" />,
        keywords: ["audio", "sound"],
      },
    ],
  },
  {
    id: "accounts",
    label: "Store & Piattaforme",
    icon: () => <span data-testid="icon-accounts" />,
    items: [
      {
        id: "store-steam",
        label: "Steam",
        icon: () => <span data-testid="icon-steam" />,
        keywords: ["steam"],
      },
    ],
  },
];

describe("SettingsSidebar component", () => {
  it("renders search input and group categories", () => {
    const setSearchQuery = vi.fn();
    const toggleGroup = vi.fn();
    const onSelectTab = vi.fn();

    renderSidebar(
      <SettingsSidebar
        searchQuery=""
        setSearchQuery={setSearchQuery}
        filteredGroups={mockGroups}
        expandedGroups={{ general: true, accounts: true }}
        toggleGroup={toggleGroup}
        activeTab="general-language"
        onSelectTab={onSelectTab}
        currentVersion="0.17.0"
      />
    );

    expect(screen.getByPlaceholderText("Cerca impostazioni...")).toBeDefined();
    expect(screen.getByText("Generale")).toBeDefined();
    expect(screen.getByText("Store & Piattaforme")).toBeDefined();
    expect(screen.getByText("Lingua & Localizzazione")).toBeDefined();
    expect(screen.getByText("Steam")).toBeDefined();
    expect(screen.getByText("v0.17.0")).toBeDefined();
  });

  it("handles tab selection click", () => {
    const setSearchQuery = vi.fn();
    const toggleGroup = vi.fn();
    const onSelectTab = vi.fn();

    renderSidebar(
      <SettingsSidebar
        searchQuery=""
        setSearchQuery={setSearchQuery}
        filteredGroups={mockGroups}
        expandedGroups={{ general: true, accounts: true }}
        toggleGroup={toggleGroup}
        activeTab="general-language"
        onSelectTab={onSelectTab}
      />
    );

    const audioTab = screen.getByText("Audio & Feedback");
    fireEvent.click(audioTab);

    expect(onSelectTab).toHaveBeenCalledWith("general-audio");
  });

  it("handles category collapse/expand click", () => {
    const setSearchQuery = vi.fn();
    const toggleGroup = vi.fn();
    const onSelectTab = vi.fn();

    renderSidebar(
      <SettingsSidebar
        searchQuery=""
        setSearchQuery={setSearchQuery}
        filteredGroups={mockGroups}
        expandedGroups={{ general: true, accounts: true }}
        toggleGroup={toggleGroup}
        activeTab="general-language"
        onSelectTab={onSelectTab}
      />
    );

    const generalHeader = screen.getByText("Generale");
    fireEvent.click(generalHeader);

    expect(toggleGroup).toHaveBeenCalledWith("general");
  });

  it("shows empty state when no groups match search filter", () => {
    const setSearchQuery = vi.fn();
    const toggleGroup = vi.fn();
    const onSelectTab = vi.fn();

    renderSidebar(
      <SettingsSidebar
        searchQuery="non-existent-query"
        setSearchQuery={setSearchQuery}
        filteredGroups={[]}
        expandedGroups={{}}
        toggleGroup={toggleGroup}
        activeTab="general-language"
        onSelectTab={onSelectTab}
      />
    );

    expect(screen.getByText("Nessuna opzione trovata")).toBeDefined();
    const resetBtn = screen.getByText("Azzera filtro");
    fireEvent.click(resetBtn);
    expect(setSearchQuery).toHaveBeenCalledWith("");
  });
});
