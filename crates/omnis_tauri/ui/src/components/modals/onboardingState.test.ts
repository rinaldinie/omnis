import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOnboardingCompleted, setOnboardingCompleted } = vi.hoisted(() => ({
  getOnboardingCompleted: vi.fn(),
  setOnboardingCompleted: vi.fn(),
}));
vi.mock("../../api", () => ({
  api: { games: { getOnboardingCompleted, setOnboardingCompleted } },
}));

import {
  __setOnboardingStateForTests,
  dismissOnboardingForSession,
  loadOnboardingState,
  markOnboardingCompleted,
  shouldShowOnboarding,
} from "./onboardingState";

describe("onboardingState", () => {
  beforeEach(() => {
    __setOnboardingStateForTests(null);
    getOnboardingCompleted.mockReset();
    setOnboardingCompleted.mockReset();
  });

  it("never shows the wizard before the backend state is known", () => {
    expect(shouldShowOnboarding()).toBe(false);
  });

  it("shows the wizard only when the backend says it is not completed", async () => {
    getOnboardingCompleted.mockResolvedValue(false);
    await loadOnboardingState();
    expect(shouldShowOnboarding()).toBe(true);

    getOnboardingCompleted.mockResolvedValue(true);
    await loadOnboardingState();
    expect(shouldShowOnboarding()).toBe(false);
  });

  it("does not trap the user in the wizard when the state cannot be read", async () => {
    getOnboardingCompleted.mockRejectedValue(new Error("io"));
    await loadOnboardingState();
    expect(shouldShowOnboarding()).toBe(false);
  });

  it("'skip for now' hides the wizard for this session without saving anything", async () => {
    getOnboardingCompleted.mockResolvedValue(false);
    await loadOnboardingState();
    dismissOnboardingForSession();
    expect(shouldShowOnboarding()).toBe(false);
    expect(setOnboardingCompleted).not.toHaveBeenCalled();
  });

  it("records completion in the backend", async () => {
    getOnboardingCompleted.mockResolvedValue(false);
    setOnboardingCompleted.mockResolvedValue(undefined);
    await loadOnboardingState();
    await markOnboardingCompleted();
    expect(setOnboardingCompleted).toHaveBeenCalledWith(true);
    expect(shouldShowOnboarding()).toBe(false);
  });
});
