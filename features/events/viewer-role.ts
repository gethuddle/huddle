export type EventViewerRole =
  | "host"
  | "venue_operator"
  | "invited"
  | "pending"
  | "attending"
  | "declined"
  | "removed"
  | "eligible";

export type EventLifecycle =
  "draft" | "pending_group_review" | "published" | "cancelled" | "completed";

type EventViewerFacts = Readonly<{
  canManage: boolean;
  hostKind: "person" | "venue";
  viewerAttendanceStatus: "requested" | "approved" | "declined" | "left" | "removed" | null;
  viewerInvitationStatus: "pending" | "accepted" | "declined" | "revoked" | null;
}>;

export function deriveEventViewerRole(facts: EventViewerFacts): EventViewerRole {
  if (facts.canManage) return facts.hostKind === "venue" ? "venue_operator" : "host";
  if (facts.viewerInvitationStatus === "pending") return "invited";
  if (facts.viewerAttendanceStatus === "requested") return "pending";
  if (facts.viewerAttendanceStatus === "approved") return "attending";
  if (facts.viewerAttendanceStatus === "declined") return "declined";
  if (facts.viewerAttendanceStatus === "removed") return "removed";
  return "eligible";
}

const presentation = {
  host: { status: "You're hosting", primaryAction: "Manage event" },
  venue_operator: { status: "Published", primaryAction: "Manage event" },
  invited: { status: "You're invited", primaryAction: "Accept invitation" },
  pending: { status: "Waiting for host", primaryAction: "Withdraw request" },
  attending: { status: "You're going", primaryAction: "Leave event" },
  declined: { status: "Request declined", primaryAction: null },
  removed: { status: "Attendance removed", primaryAction: null },
  eligible: { status: "Places available", primaryAction: "Ask to join" },
} as const satisfies Record<
  EventViewerRole,
  Readonly<{ status: string; primaryAction: string | null }>
>;

const lifecycleStatus: Record<EventLifecycle, string> = {
  draft: "Draft",
  pending_group_review: "Pending group review",
  published: "Published",
  cancelled: "Cancelled",
  completed: "Completed",
};

export function eventViewerPresentation(role: EventViewerRole, eventStatus: EventLifecycle) {
  if (role === "venue_operator") {
    return { status: lifecycleStatus[eventStatus], primaryAction: "Manage event" };
  }
  if (eventStatus === "cancelled" || eventStatus === "completed") {
    return { status: lifecycleStatus[eventStatus], primaryAction: null };
  }
  return presentation[role];
}
