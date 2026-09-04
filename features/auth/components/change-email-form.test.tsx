// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ChangeEmailForm } from "./change-email-form";
const mocks = vi.hoisted(() => ({ changeEmailAction: vi.fn() }));
vi.mock("@/features/auth/actions", () => ({ changeEmailAction: mocks.changeEmailAction }));
it("keeps the requested email on failure and prevents edits during reauthentication", async () => {
  const response = Promise.withResolvers<unknown>();
  mocks.changeEmailAction.mockReturnValue(response.promise);
  render(<ChangeEmailForm />);
  fireEvent.change(screen.getByLabelText("New email address"), {
    target: { value: "new@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Current password for email change"), {
    target: { value: "secret" },
  });
  fireEvent.submit(screen.getByRole("button", { name: "Request email change" }).closest("form")!);
  expect(screen.getByRole("button", { name: "Requesting confirmation…" })).toBeDisabled();
  expect(screen.getByLabelText("New email address")).toBeDisabled();
  await act(async () =>
    response.resolve({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Check the highlighted fields.",
        fields: { currentPassword: ["Current password is incorrect."] },
      },
    }),
  );
  expect(screen.getByLabelText("New email address")).toHaveValue("new@example.com");
  expect(screen.getByText("Current password is incorrect.")).toBeVisible();
});
