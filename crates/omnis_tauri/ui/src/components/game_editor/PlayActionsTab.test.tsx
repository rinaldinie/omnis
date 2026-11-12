import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { PlayActionsTab } from "./PlayActionsTab";
import { LaunchConfiguration } from "./types";
import { I18nProvider } from "../../i18n";

describe("PlayActionsTab component", () => {
  it("renders empty state when playActions is empty", () => {
    const onAddAction = vi.fn();
    render(
      <I18nProvider>
        <PlayActionsTab
          playActions={[]}
          onAddAction={onAddAction}
          onRemoveAction={vi.fn()}
          onUpdateAction={vi.fn()}
          onPickExe={vi.fn()}
          onPickDir={vi.fn()}
        />
      </I18nProvider>
    );

    expect(screen.getByText(/no launch actions set up/i)).toBeTruthy();
  });

  it("renders play action cards and allows editing", () => {
    const actions: LaunchConfiguration[] = [
      {
        executable: "C:\\Games\\test.exe",
        arguments: ["-novid", "-fullscreen"],
        working_dir: "C:\\Games",
        tracking_mode: { type: "KernelJobObject" },
      },
    ];

    const onUpdateAction = vi.fn();
    const onRemoveAction = vi.fn();

    render(
      <I18nProvider>
        <PlayActionsTab
          playActions={actions}
          onAddAction={vi.fn()}
          onRemoveAction={onRemoveAction}
          onUpdateAction={onUpdateAction}
          onPickExe={vi.fn()}
          onPickDir={vi.fn()}
        />
      </I18nProvider>
    );

    const exeInput = screen.getByDisplayValue("C:\\Games\\test.exe");
    expect(exeInput).toBeTruthy();

    const argsInput = screen.getByDisplayValue("-novid -fullscreen");
    expect(argsInput).toBeTruthy();

    fireEvent.change(exeInput, { target: { value: "C:\\Games\\updated.exe" } });
    expect(onUpdateAction).toHaveBeenCalledWith(0, "executable", "C:\\Games\\updated.exe");

    fireEvent.change(argsInput, { target: { value: "-novid -fullscreen -windowed" } });
    expect(onUpdateAction).toHaveBeenCalledWith(0, "arguments", [
      "-novid",
      "-fullscreen",
      "-windowed",
    ]);
  });
});
