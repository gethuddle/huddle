// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileForm } from "./profile-form";

const mocks = vi.hoisted(() => ({ saveProfileAction: vi.fn() }));

vi.mock("@/features/profiles/actions", () => ({
  saveProfileAction: mocks.saveProfileAction,
}));

const cities = [
  { id: "1", slug: "haifa", name: "Haifa" },
  { id: "2", slug: "jerusalem", name: "Jerusalem" },
] as const;

describe("ProfileForm", () => {
  beforeEach(() => vi.clearAllMocks());

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
    expect(screen.getByRole("combobox", { name: "Israel city" })).toBeVisible();
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
    const user = userEvent.setup();

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

    await user.type(screen.getByRole("textbox", { name: "Display name" }), "Fan One");
    await user.type(screen.getByRole("textbox", { name: "Handle" }), "fan_one");
    await user.selectOptions(screen.getByRole("combobox", { name: "Israel city" }), "haifa");
    await user.click(screen.getByRole("checkbox", { name: /18 or older/i }));
    await user.click(screen.getByRole("checkbox", { name: /accept the current/i }));
    expect(screen.getByRole("combobox", { name: "Israel city" })).toHaveValue("haifa");
    await user.click(screen.getByRole("button", { name: "Complete profile" }));

    await waitFor(() => expect(mocks.saveProfileAction).toHaveBeenCalledOnce());
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose another handle.");
    expect(screen.getByRole("textbox", { name: "Display name" })).toHaveValue("Fan One");
    expect(screen.getByRole("textbox", { name: "Handle" })).toHaveValue("fan_one");
    expect(screen.getByRole("combobox", { name: "Israel city" })).toHaveValue("haifa");
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

    expect(screen.getByText(/18\+ attestation is recorded/i)).toBeVisible();
    expect(screen.getByText(/accepted this version/i)).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeVisible();
  });
});
