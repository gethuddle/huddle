// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("@/features/events/actions", () => ({ saveVenueEventAction: mocks.save }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { VenueEventEditor } from "./venue-event-editor";

const event = {
  event_id: "90000000-0000-4000-8000-000000000401",
  venue_id: "90000000-0000-4000-8000-000000000402",
  venue_slug: "corner",
  match_id: "90000000-0000-4000-8000-000000000403",
  attendance_mode: "open_door" as const,
  venue_space_id: null,
  venue_space_name: null,
  audience: "public" as const,
  audience_team_id: null,
  capacity: null,
  title: "Derby night",
  description: "Watch the match together.",
  expected_activity: "Watch the match",
  cost_description: "Free",
  event_rules: "Respect everyone",
  commercial_affiliation: "Hosted by corner",
  host_presence_confirmed: true,
  requires_approval: false,
  status: "draft" as const,
  starts_at: "2026-09-12T17:00:00Z",
  ends_at: "2026-09-12T20:00:00Z",
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-04T12:00:00Z"));
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({
    ok: true,
    data: { message: "Venue event published.", event: { id: event.event_id, status: "published" } },
  });
});
afterEach(() => vi.useRealTimers());
it("retains cancellation for a stale draft without offering impossible edits", async () => {
  render(
    <VenueEventEditor
      event={{ ...event, starts_at: "2020-01-01T17:00:00Z" }}
      canEdit
      canPublish={false}
    />,
  );
  expect(screen.getByLabelText("Event title")).toBeDisabled();
  expect(screen.getByRole("button", { name: /^Save draft$/ })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: /^Cancel draft$/ }));
  await userEvent.click(screen.getByRole("button", { name: /^Confirm cancellation$/ }));
  expect((mocks.save.mock.calls[0][1] as FormData).get("intent")).toBe("cancel");
});
it("reopens a saved draft, edits and publishes through the existing venue action", async () => {
  render(<VenueEventEditor event={event} canEdit canPublish />);
  await userEvent.clear(screen.getByLabelText("Event title"));
  await userEvent.type(screen.getByLabelText("Event title"), "Updated derby night");
  await userEvent.click(screen.getByRole("button", { name: "Publish event" }));
  expect(screen.getByRole("status")).toHaveTextContent("Venue event published.");
  const form = mocks.save.mock.calls[0][1] as FormData;
  expect(form.get("eventId")).toBe(event.event_id);
  expect(form.get("title")).toBe("Updated derby night");
  expect(form.get("intent")).toBe("publish");
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
});
it("permits draft preparation but disables publication when entitlement is inactive", () => {
  render(<VenueEventEditor event={event} canEdit canPublish={false} />);
  expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Publish event" })).toBeDisabled();
});
it("confirms draft cancellation and preserves input on transport failure", async () => {
  mocks.save.mockRejectedValue(new Error("Offline"));
  render(<VenueEventEditor event={event} canEdit canPublish />);
  await userEvent.click(screen.getByRole("button", { name: "Cancel draft" }));
  expect(mocks.save).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/try again/i);
  expect(screen.getByLabelText("Event title")).toHaveValue("Derby night");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeEnabled(),
  );
});
