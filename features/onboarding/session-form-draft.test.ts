// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { clearOnboardingSessionDrafts, onboardingSessionDraftKey } from "./session-form-draft";

describe("onboarding session drafts", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("isolates unfinished setup by authenticated account and workspace kind", () => {
    expect(onboardingSessionDraftKey("fan", "account-a")).not.toBe(
      onboardingSessionDraftKey("fan", "account-b"),
    );
    expect(onboardingSessionDraftKey("fan", "account-a")).not.toBe(
      onboardingSessionDraftKey("venue", "account-a"),
    );
  });

  it("removes every private onboarding draft without clearing unrelated tab state", () => {
    window.sessionStorage.setItem(onboardingSessionDraftKey("fan", "account-a"), "fan-draft");
    window.sessionStorage.setItem(onboardingSessionDraftKey("venue", "account-a"), "venue-draft");
    window.sessionStorage.setItem("unrelated", "keep-me");

    clearOnboardingSessionDrafts();

    expect(window.sessionStorage.getItem(onboardingSessionDraftKey("fan", "account-a"))).toBeNull();
    expect(
      window.sessionStorage.getItem(onboardingSessionDraftKey("venue", "account-a")),
    ).toBeNull();
    expect(window.sessionStorage.getItem("unrelated")).toBe("keep-me");
  });
});
