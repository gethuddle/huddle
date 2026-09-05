"use client";

import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  // Only participation changes release a successful action; capacity refreshes alone do not.
  const participationKey = JSON.stringify([
    props.eventId,
    props.eventStatus,
    props.viewerInvitationId,
    props.viewerInvitationStatus,
    props.viewerAttendanceId,
    props.viewerAttendanceStatus,
  ]);
  const submission = useRef<{ key: string; inFlight: boolean } | null>(null);
  const mutation = useMutation<
    AttendanceActionState,
    Error,
    {
      formData: FormData;
      participationKey: string;
      expectedAttendanceStatus: "requested" | "approved" | "left" | null;
    }
  >({
    mutationFn: async ({ formData }) => {
      const intent = formData.get("mutationIntent");
      if (intent === "respond") return respondToEventInvitationAction(formData);
      if (intent === "leave") return leaveEventAction(formData);
      return requestOrJoinEventAction(formData);
    },
    onSuccess: (result, { formData }) => {
      if (!result.ok) submission.current = null;
      else {
        if (submission.current) {
          submission.current.inFlight = false;
        }
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
    onError: () => {
      submission.current = null;
    },
  });
  const { reset, variables, isPending, data: result } = mutation;
  const acknowledgementMatches =
    result?.ok === true &&
    variables !== undefined &&
    props.eventId === variables.formData.get("eventId") &&
    props.eventStatus === "published" &&
    variables.expectedAttendanceStatus !== null &&
    props.viewerAttendanceStatus === variables.expectedAttendanceStatus &&
    (variables.formData.get("mutationIntent") !== "respond" ||
      (props.viewerInvitationId === variables.formData.get("invitationId") &&
        props.viewerInvitationStatus === "accepted"));
  useEffect(() => {
    if (
      !isPending &&
      variables &&
      (variables.participationKey !== participationKey ||
        (result?.ok === true && submission.current === null))
    ) {
      submission.current = null;
      // A matching refresh confirms the acknowledgement; it must remain readable.
      // A later contradictory state or another event makes that feedback stale.
      if (!acknowledgementMatches) reset();
    }
  }, [participationKey, isPending, variables, acknowledgementMatches, result?.ok, reset]);

  function submit(data: FormData) {
    if (submission.current?.inFlight || submission.current?.key === participationKey) return;
    submission.current = { key: participationKey, inFlight: true };
    const intent = data.get("mutationIntent");
    const expectedAttendanceStatus =
      intent === "leave"
        ? "left"
        : intent === "respond"
          ? data.get("decision") === "accept"
            ? "approved"
            : null
          : props.hostKind === "venue" && !props.requiresApproval
            ? "approved"
            : "requested";
    mutation.mutate({ formData: data, participationKey, expectedAttendanceStatus });
  }

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

  const immediateJoin = props.hostKind === "venue" && !props.requiresApproval;
  const immediateJoinIsFull = immediateJoin && props.remainingCapacity === 0;
  if (!props.viewerIsAuthenticated && immediateJoinIsFull) {
    return (
      <Button className="w-full" disabled>
        Event full
      </Button>
    );
  }
  if (!props.viewerIsAuthenticated) {
    return (
      <Button asChild className="w-full">
        <Link href={`/auth/sign-in?next=/events/${props.eventId}`}>Sign in to join</Link>
      </Button>
    );
  }

  const pending =
    mutation.isPending ||
    (mutation.isSuccess &&
      mutation.data.ok &&
      mutation.variables.participationKey === participationKey);
  const feedbackIsCurrent =
    variables?.participationKey === participationKey || acknowledgementMatches;
  const feedback = (
    <AttendanceActionFeedback
      state={feedbackIsCurrent ? mutation.data : undefined}
      error={feedbackIsCurrent ? mutation.error : undefined}
    />
  );
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
              submit(
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
              submit(
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
        <AlertDialog
          onOpenChange={(open) => {
            if (!pending) setConfirmingLeave(open);
          }}
          open={confirmingLeave}
        >
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
            {feedback}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Stay</AlertDialogCancel>
              <Button
                disabled={pending}
                onClick={() =>
                  submit(
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
          onClick={() => submit(form({ mutationIntent: "join", eventId: props.eventId }))}
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
      {feedback}
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
