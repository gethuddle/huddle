"use client";

import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  leaveEventAction,
  requestOrJoinEventAction,
  respondToEventInvitationAction,
} from "@/features/attendance/actions";
import { AttendanceActionFeedback } from "@/features/attendance/components/action-feedback";
import type { AttendanceActionState } from "@/features/attendance/state";
import { deriveEventViewerRole, type EventViewerRole } from "@/features/events/viewer-role";

type Props = Readonly<{
  eventId: string;
  eventStatus: "draft" | "pending_group_review" | "published" | "cancelled" | "completed";
  hostKind: "person" | "venue";
  requiresApproval: boolean;
  remainingCapacity: number;
  viewerIsAuthenticated: boolean;
  viewerInvitationId: string | null;
  viewerInvitationStatus: "pending" | "accepted" | "declined" | "revoked" | null;
  viewerAttendanceId: string | null;
  viewerAttendanceStatus: "requested" | "approved" | "declined" | "left" | "removed" | null;
  canManage: boolean;
  viewerRole?: EventViewerRole;
}>;

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

function EventParticipationControlsInner(props: Props) {
  const router = useRouter();
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const mutation = useMutation<AttendanceActionState, Error, FormData>({
    mutationFn: async (formData) => {
      const intent = formData.get("mutationIntent");
      if (intent === "respond") return respondToEventInvitationAction(formData);
      if (intent === "leave") return leaveEventAction(formData);
      return requestOrJoinEventAction(formData);
    },
    onSuccess: (result, formData) => {
      if (result.ok) {
        setConfirmingLeave(false);
        if (
          formData.get("mutationIntent") === "respond" &&
          formData.get("decision") === "decline"
        ) {
          router.push("/dashboard?notice=invitation-declined");
          return;
        }
        router.refresh();
      }
    },
  });

  const viewerRole =
    props.viewerRole ??
    deriveEventViewerRole({
      canManage: props.canManage,
      hostKind: props.hostKind,
      viewerAttendanceStatus: props.viewerAttendanceStatus,
      viewerInvitationStatus: props.viewerInvitationStatus,
    });

  if (viewerRole === "host" || viewerRole === "venue_operator") {
    return (
      <div className="space-y-3">
        <Button asChild className="w-full">
          <Link href={`/events/${props.eventId}/manage`}>Manage event</Link>
        </Button>
        {props.eventStatus === "published" ? (
          <Button asChild className="w-full" variant="outline">
            <a href={`/api/events/${props.eventId}/calendar.ics`}>Add to calendar</a>
          </Button>
        ) : null}
      </div>
    );
  }

  if (props.eventStatus !== "published") {
    return <p className="text-sm text-muted-foreground">Participation is closed for this event.</p>;
  }

  if (!props.viewerIsAuthenticated) {
    return (
      <Button asChild className="w-full">
        <Link href={`/auth/sign-in?next=/events/${props.eventId}`}>Sign in to join</Link>
      </Button>
    );
  }

  const pending = mutation.isPending;
  const immediateJoin = props.hostKind === "venue" && !props.requiresApproval;
  const immediateJoinIsFull = immediateJoin && props.remainingCapacity === 0;
  const canLeave =
    props.viewerAttendanceId !== null &&
    (props.viewerAttendanceStatus === "requested" || props.viewerAttendanceStatus === "approved");

  return (
    <div className="space-y-3">
      {viewerRole === "invited" && props.viewerInvitationId !== null ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            disabled={pending}
            onClick={() =>
              mutation.mutate(
                form({
                  mutationIntent: "respond",
                  eventId: props.eventId,
                  invitationId: props.viewerInvitationId ?? "",
                  decision: "accept",
                }),
              )
            }
            type="button"
          >
            {pending ? "Saving…" : "Accept invitation"}
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              mutation.mutate(
                form({
                  mutationIntent: "respond",
                  eventId: props.eventId,
                  invitationId: props.viewerInvitationId ?? "",
                  decision: "decline",
                }),
              )
            }
            type="button"
            variant="outline"
          >
            Decline
          </Button>
        </div>
      ) : (viewerRole === "pending" || viewerRole === "attending") && canLeave ? (
        <AlertDialog onOpenChange={setConfirmingLeave} open={confirmingLeave}>
          <AlertDialogTrigger asChild>
            <Button className="w-full" disabled={pending} type="button" variant="outline">
              {props.viewerAttendanceStatus === "approved" ? "Leave event" : "Withdraw request"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {props.viewerAttendanceStatus === "approved"
                  ? "Leave this event?"
                  : "Withdraw this request?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Your attendance row remains in the event history. Leaving immediately removes any
                future access to a protected home address.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Stay</AlertDialogCancel>
              <Button
                disabled={pending}
                onClick={() =>
                  mutation.mutate(
                    form({
                      mutationIntent: "leave",
                      eventId: props.eventId,
                      attendanceId: props.viewerAttendanceId ?? "",
                    }),
                  )
                }
                type="button"
                variant="destructive"
              >
                {pending ? "Saving…" : "Confirm leave"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : props.viewerAttendanceStatus === "declined" ||
        props.viewerAttendanceStatus === "removed" ? (
        <p className="text-sm text-muted-foreground">This attendance response is closed.</p>
      ) : (
        <Button
          className="w-full"
          disabled={pending || immediateJoinIsFull}
          onClick={() => mutation.mutate(form({ mutationIntent: "join", eventId: props.eventId }))}
          type="button"
        >
          {pending
            ? "Saving…"
            : immediateJoinIsFull
              ? "Event full"
              : immediateJoin
                ? "Join event"
                : "Request to attend"}
        </Button>
      )}

      {props.viewerAttendanceStatus === "approved" || props.hostKind === "venue" ? (
        <Button asChild className="w-full" variant="outline">
          <a href={`/api/events/${props.eventId}/calendar.ics`}>Add to calendar</a>
        </Button>
      ) : null}
      <AttendanceActionFeedback state={mutation.data} />
    </div>
  );
}

export function EventParticipationControls(props: Props) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <EventParticipationControlsInner {...props} />
    </QueryClientProvider>
  );
}
