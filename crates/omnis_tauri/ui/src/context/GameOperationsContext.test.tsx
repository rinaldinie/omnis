import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  GameOperationsProvider,
  useGameOperationsContext,
  useOptionalGameOperationsContext,
  GameOperationsContextType,
} from "./GameOperationsContext";

describe("GameOperationsContext", () => {
  const dummyOperations = {
    handleLaunch: vi.fn(),
    handleSync: vi.fn(),
    handleKillRunningGame: vi.fn(),
    confirmKillRunningGame: vi.fn(),
    handleOpenFolder: vi.fn(),
    handleOpenInstallDir: vi.fn(),
    handleCreateShortcut: vi.fn(),
    handleVerifyFiles: vi.fn(),
    handleOpenUninstallModal: vi.fn(),
    handleConfirmUninstall: vi.fn(),
    handleRemoveFromLibrary: vi.fn(),
    handleEnrichSingleGame: vi.fn(),
    handleRefreshHltb: vi.fn(),
    handleUpdateCompletionStatus: vi.fn(),
    handleToggleHidden: vi.fn(),
    handleToggleFavorite: vi.fn(),
    handlePromoteCopy: vi.fn(),
    handleDownloadAll: vi.fn(),
    isEnrichingSingle: false,
    isDownloading: false,
  } as unknown as GameOperationsContextType;

  it("throws when useGameOperationsContext is called outside provider", () => {
    expect(() => renderHook(() => useGameOperationsContext())).toThrow(
      "useGameOperationsContext must be used within a GameOperationsProvider"
    );
  });

  it("returns null when useOptionalGameOperationsContext is called outside provider", () => {
    const { result } = renderHook(() => useOptionalGameOperationsContext());
    expect(result.current).toBeNull();
  });

  it("returns context value when wrapped in GameOperationsProvider", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GameOperationsProvider value={dummyOperations}>
        {children}
      </GameOperationsProvider>
    );

    const { result } = renderHook(() => useGameOperationsContext(), { wrapper });
    expect(result.current).toBe(dummyOperations);
    expect(result.current.handleLaunch).toBe(dummyOperations.handleLaunch);
  });
});
