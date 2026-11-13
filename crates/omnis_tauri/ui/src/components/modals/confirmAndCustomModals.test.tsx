import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { I18nProvider } from "@/i18n";
import { KillGameConfirmModal } from "./KillGameConfirmModal";
import { UninstallModal } from "./UninstallModal";
import CustomGameModal from "./CustomGameModal";
import { RestoreConfirmModal } from "@/components/settings/backup/RestoreConfirmModal";
import type { GameDto, BackupInspectionDto } from "@/types";

const mockGame = {
  id: "g1",
  title: "Hades",
  library: "steam",
  playtime_formatted: "12h",
  genres: ["Action", "Roguelike"],
} as unknown as GameDto;

const mockInspection: BackupInspectionDto = {
  format_version: 1,
  created_at_utc: "2026-11-13T10:00:00Z",
  omnis_version: "0.21.1",
  schema_version: 1,
  hostname: "gaming-pc",
  include_artwork: true,
  total_games: 42,
  backup_size_bytes: 1024,
  has_database: true,
  has_settings: true,
  has_artwork: true,
  custom_themes_count: 2,
};

describe("Phase 2 Dialog & Simple Modals", () => {
  it("renders KillGameConfirmModal with dialog role and triggers confirm/cancel", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <KillGameConfirmModal
        isOpen={true}
        activeGame={{
          session_id: "s1",
          game_id: "g1",
          title: "Hades",
          state: "running",
          started_at: "2026-11-13T10:00:00Z",
        }}
        onClose={onClose}
        onConfirm={onConfirm}
        t={(k) => k}
      />
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Hades")).toBeTruthy();
    fireEvent.click(screen.getByText("app_misc.kill_confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("app_misc.cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders UninstallModal and respects Escape to close when idle", () => {
    const onClose = vi.fn();
    render(
      <I18nProvider initialLocale="en">
        <UninstallModal
          isOpen={true}
          game={mockGame}
          onClose={onClose}
          onConfirmUninstall={vi.fn()}
        />
      </I18nProvider>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(screen.getByText("Hades")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders CustomGameModal form inputs", () => {
    render(
      <I18nProvider initialLocale="en">
        <CustomGameModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      </I18nProvider>
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBe(3);
  });

  it("renders RestoreConfirmModal and blocks closing while restoring", () => {
    const onClose = vi.fn();
    render(
      <I18nProvider initialLocale="en">
        <RestoreConfirmModal
          isOpen={true}
          inspection={mockInspection}
          isRestoring={true}
          onClose={onClose}
          onConfirm={vi.fn()}
          formatDate={(d) => d || "-"}
        />
      </I18nProvider>
    );

    const dialog = screen.getByRole("dialog");
    expect(screen.getByText("42")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
