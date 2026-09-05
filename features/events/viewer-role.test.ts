import { describe, expect, it } from "vitest";

import { deriveEventViewerRole, eventViewerPresentation } from "./viewer-role";

const base = {
  canManage: false,
  hostKind: "person" as const,
  viewerAttendanceStatus: null,
  viewerInvitationStatus: null,
};

describe("EventViewerRole", () => {
  it.each([
    [{ ...base, canManage: true }, "host", "You're hosting", "Manage event"],
    [
      { ...base, canManage: true, hostKind: "venue" as const },
      "venue_operator",
      "Published",
      "Manage event",
    ],
    [
      { ...base, viewerInvitationStatus: "pending" as const },
      "invited",
      "You're invited",
      "Accept invitation",
    ],
    [
      { ...base, viewerAttendanceStatus: "requested" as const },
      "pending",
      "Waiting for host",
      "Withdraw request",
    ],
    [
      { ...base, viewerAttendanceStatus: "approved" as const },
      "attending",
      "You're going",
      "Leave event",
    ],
    [base, "eligible", "Places available", "Ask to join"],
  ] as const)("maps one authoritative viewer state to %s", (facts, role, status, primaryAction) => {
    expect(deriveEventViewerRole(facts)).toBe(role);
    expect(eventViewerPresentation(role, "published")).toEqual({ status, primaryAction });
  });

  it.each([
    ["draft", "Draft"],
    ["published", "Published"],
  ] as const)("shows the canonical Venue %s lifecycle", (eventStatus, status) => {
    expect(eventViewerPresentation("venue_operator", eventStatus)).toEqual({
      status,
      primaryAction: "Manage event",
    });
  });

  it.each([
    ["declined", "Request declined"],
    ["removed", "Attendance removed"],
  ] as const)(
    "keeps %s attendance terminal instead of showing eligibility",
    (attendance, status) => {
      const role = deriveEventViewerRole({
        ...base,
        viewerAttendanceStatus: attendance,
      });

      expect(role).toBe(attendance);
      expect(eventViewerPresentation(role, "published")).toEqual({ status, primaryAction: null });
    },
  );

  it("never lets retained closed relationship residue outrank a current invitation", () => {
    expect(
      deriveEventViewerRole({
        ...base,
        viewerAttendanceStatus: "removed",
        viewerInvitationStatus: "pending",
      }),
    ).toBe("invited");
  });
});

it("replaces acquisition promises for a full instant-join event while preserving approval requests", () => {
  const capacity = { hostKind: "venue" as const, requiresApproval: false, remainingCapacity: 0 };
  expect(eventViewerPresentation("eligible", "published", capacity)).toEqual({
    status: "Event full",
    primaryAction: null,
  });
  expect(
    eventViewerPresentation("eligible", "published", { ...capacity, requiresApproval: true })
      .primaryAction,
  ).not.toBeNull();
  expect(eventViewerPresentation("attending", "published", capacity).primaryAction).toBe(
    "Leave event",
  );
});
