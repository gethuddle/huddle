// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ discard: vi.fn(), refresh: vi.fn() }));
vi.mock("@/features/events/actions", () => ({ discardEventDraftAction: mocks.discard }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { EventDraftList } from "./event-draft-list";
const draft = {
  id: "60000000-0000-4000-8000-000000000111",
  title: "Saturday watch",
  step: 2 as const,
  homeTeamName: "Arsenal",
  awayTeamName: "Chelsea",
  startsAt: "2026-09-12T17:00:00Z",
  savedAt: "2026-09-04T10:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.discard.mockResolvedValue({ ok: true, data: { message: "Draft discarded." } });
});
it("offers resume and removes only the confirmed owner draft after acknowledgement", async () => {
  render(<EventDraftList drafts={[draft]} />);
  expect(screen.getByRole("link", { name: "Resume draft" })).toHaveAttribute(
    "href",
    `/events/new?draft=${draft.id}`,
  );
  await userEvent.click(screen.getByRole("button", { name: "Discard draft" }));
  expect(mocks.discard).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Confirm discard" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Draft discarded.");
  expect(screen.queryByRole("link", { name: "Resume draft" })).not.toBeInTheDocument();
});
it("retains the draft when server authorization denies discard", async () => {
  mocks.discard.mockResolvedValue({
    ok: false,
    error: { code: "NOT_ALLOWED", message: "This action is not allowed." },
  });
  render(<EventDraftList drafts={[draft]} />);
  await userEvent.click(screen.getByRole("button", { name: "Discard draft" }));
  await userEvent.click(screen.getByRole("button", { name: "Confirm discard" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("This action is not allowed.");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Confirm discard" })).toBeEnabled(),
  );
  expect(screen.getByRole("link", { name: "Resume draft" })).toBeVisible();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("keeps the draft and confirmation available after rejected discard", async () => {
  mocks.discard.mockRejectedValue(new Error("Offline"));
  render(<EventDraftList drafts={[draft]} />);
  await userEvent.click(screen.getByRole("button", { name: "Discard draft" }));
  await userEvent.click(screen.getByRole("button", { name: "Confirm discard" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Confirm discard" })).toBeEnabled(),
  );
  expect(screen.getByRole("link", { name: "Resume draft" })).toBeVisible();
});
