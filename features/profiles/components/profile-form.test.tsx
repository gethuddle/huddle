// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileForm } from "./profile-form";

const mocks = vi.hoisted(() => ({
  activateFanOnboardingAction: vi.fn(),
  saveProfileAction: vi.fn(),
}));

vi.mock("@/features/profiles/actions", () => ({
  activateFanOnboardingAction: mocks.activateFanOnboardingAction,
  saveProfileAction: mocks.saveProfileAction,
}));

const cities = [
  { id: "1", slug: "haifa", name: "Haifa" },
  { id: "2", slug: "jerusalem", name: "Jerusalem" },
] as const;

describe("ProfileForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });
  afterEach(() => window.sessionStorage.clear());

  it("renders labelled onboarding fields and both required confirmations", () => {
    render(
      <ProfileForm
        cities={cities}
        initialValue={{
          handle: "",
          displayName: "",
          citySlug: "",
          bio: "",
          adultAttested: false,
          currentRulesAccepted: false,
          completed: false,
        }}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Display name" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Handle" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "City" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /18 or older/i })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /accept the current/i })).toBeVisible();
    expect(screen.getByRole("button", { name: "Complete profile" })).toBeVisible();
  });

  it("submits a complete profile and renders a safe server error", async () => {
    mocks.saveProfileAction.mockResolvedValue({
      ok: false,
      error: { code: "HANDLE_UNAVAILABLE", message: "Choose another handle." },
      values: {
        handle: "fan_one",
        displayName: "Fan One",
        citySlug: "haifa",
        bio: "",
        adultAttested: true,
        rulesAccepted: true,
      },
      attempt: 1,
    });
    render(
      <ProfileForm
        cities={cities}
        initialValue={{
          handle: "",
          displayName: "",
          citySlug: "",
          bio: "",
          adultAttested: false,
          currentRulesAccepted: false,
          completed: false,
        }}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
      target: { value: "Fan One" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Handle" }), {
      target: { value: "fan_one" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "City" }), {
      target: { value: "haifa" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /18 or older/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /accept the current/i }));
    expect(screen.getByRole("combobox", { name: "City" })).toHaveValue("haifa");
    const submitButton = screen.getByRole("button", { name: "Complete profile" });
    const form = submitButton.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    await waitFor(() => expect(mocks.saveProfileAction).toHaveBeenCalledOnce());
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose another handle.");
    expect(screen.getByRole("textbox", { name: "Display name" })).toHaveValue("Fan One");
    expect(screen.getByRole("textbox", { name: "Handle" })).toHaveValue("fan_one");
    expect(screen.getByRole("combobox", { name: "City" })).toHaveValue("haifa");
    expect(screen.getByRole("checkbox", { name: /18 or older/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /accept the current/i })).toBeChecked();
  });

  it("renders recorded trust facts without asking a completed user to attest again", () => {
    render(
      <ProfileForm
        cities={cities}
        initialValue={{
          handle: "fan_one",
          displayName: "Fan One",
          citySlug: "haifa",
          bio: "",
          adultAttested: true,
          currentRulesAccepted: true,
          completed: true,
        }}
      />,
    );

    expect(screen.getByText("Eligibility saved")).toBeVisible();
    expect(screen.getByText(/18\+ attestation and current community rules/i)).toBeVisible();
    expect(screen.queryByText(/No threats, planned fights/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeVisible();
  });

  it("shows the full rules only when a completed profile must accept a newer version", () => {
    render(
      <ProfileForm
        cities={cities}
        initialValue={{
          handle: "fan_one",
          displayName: "Fan One",
          citySlug: "haifa",
          bio: "Match day regular",
          adultAttested: true,
          currentRulesAccepted: false,
          completed: true,
        }}
      />,
    );

    expect(screen.getByText(/No threats, planned fights/i)).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /accept the current/i })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: /18 or older/i })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Display name" })).toHaveValue("Fan One");
    expect(screen.getByRole("textbox", { name: "Short bio (optional)" })).toHaveValue(
      "Match day regular",
    );
  });

  it("presents onboarding as an entry into Fan Home", () => {
    render(
      <ProfileForm
        cities={cities}
        initialValue={{
          handle: "",
          displayName: "",
          citySlug: "",
          bio: "",
          adultAttested: false,
          currentRulesAccepted: false,
          completed: false,
        }}
        draftOwnerId="account-a"
        mode="onboarding"
      />,
    );

    expect(screen.getByRole("button", { name: "Start using Huddle" })).toBeVisible();
  });

  it("restores unfinished Fan profile fields without persisting legal confirmations", () => {
    const props = {
      cities,
      draftOwnerId: "account-a",
      initialValue: {
        handle: "",
        displayName: "",
        citySlug: "",
        bio: "",
        adultAttested: false,
        currentRulesAccepted: false,
        completed: false,
      },
      mode: "onboarding" as const,
    };
    const first = render(<ProfileForm {...props} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
      target: { value: "Alex Local" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Handle" }), {
      target: { value: "alex_local" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "City" }), {
      target: { value: "haifa" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Short bio (optional)" }), {
      target: { value: "Arsenal and away days" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /18 or older/i }));
    first.unmount();

    render(<ProfileForm {...props} />);
    expect(screen.getByRole("textbox", { name: "Display name" })).toHaveValue("Alex Local");
    expect(screen.getByRole("textbox", { name: "Handle" })).toHaveValue("alex_local");
    expect(screen.getByRole("combobox", { name: "City" })).toHaveValue("haifa");
    expect(screen.getByRole("textbox", { name: "Short bio (optional)" })).toHaveValue(
      "Arsenal and away days",
    );
    expect(screen.getByRole("checkbox", { name: /18 or older/i })).not.toBeChecked();
  });
});
