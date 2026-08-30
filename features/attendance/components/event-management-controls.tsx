"use client";

import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelEventAction,
  removeAttendeeAction,
  reviewAttendanceAction,
  revokeEventInvitationAction,
} from "@/features/attendance/actions";
import { AttendanceActionFeedback } from "@/features/attendance/components/action-feedback";
import {
  EventInvitationPicker,
  type EventInvitationCandidate,
} from "@/features/attendance/components/event-invitation-picker";
import type { EventAttendance, EventInvitation } from "@/features/attendance/queries";
import type { AttendanceActionState } from "@/features/attendance/state";

type MutationIntent = "revoke" | "review" | "remove" | "cancel";

function EventManagementControlsInner({
  attendance,
  attendanceMode,
  candidates,
  eventId,
  eventStatus,
  invitations,
  remainingCapacity,
}: Readonly<{
  attendance: EventAttendance[];
  attendanceMode: "open_door" | "reservations";
  candidates: readonly EventInvitationCandidate[];
  eventId: string;
  eventStatus: string;
  invitations: EventInvitation[];
  remainingCapacity: number;
}>) {
  const router = useRouter();
  const mutation = useMutation<AttendanceActionState, Error, FormData>({
    mutationFn: async (formData) => {
      const intent = formData.get("mutationIntent") as MutationIntent;
      if (intent === "revoke") return revokeEventInvitationAction(formData);
      if (intent === "review") return reviewAttendanceAction(formData);
      if (intent === "remove") return removeAttendeeAction(formData);
      return cancelEventAction(formData);
    },
    onSuccess: (result) => {
      if (result.ok) router.refresh();
    },
  });

  function submit(intent: MutationIntent, formData: FormData) {
    formData.set("mutationIntent", intent);
    formData.set("eventId", eventId);
    mutation.mutate(formData);
  }

  if (attendanceMode === "open_door") {
    return (
      <div className="space-y-8">
        <AttendanceActionFeedback state={mutation.data} />
        <Card>
          <CardHeader>
            <h2 className="text-2xl font-semibold text-linen">Open-door event</h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-dark">
              Fans simply come to the venue. Huddle does not collect invitations, requests,
              approvals, a guest list, or a capacity count for this event.
            </p>
          </CardContent>
        </Card>
        {eventStatus === "published" ? (
          <CancelEventControl disabled={mutation.isPending} submit={submit} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AttendanceActionFeedback state={mutation.data} />

      <Card>
        <CardHeader>
          <h2 className="text-2xl font-semibold text-linen">Invite people</h2>
          <p className="mt-2 text-sm leading-6 text-muted-dark">
            Search eligible registered supporters here. Invitations never add guests or plus-ones,
            and acceptance rechecks capacity and current safety eligibility.
          </p>
        </CardHeader>
        <CardContent>
          {eventStatus === "published" ? (
            <EventInvitationPicker
              candidates={candidates}
              eventId={eventId}
              remainingCapacity={remainingCapacity}
            />
          ) : (
            <p className="text-sm text-muted-dark">Publish the event before inviting people.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-2xl font-semibold text-linen">Invitations</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-dark">No invitations yet.</p>
          ) : (
            invitations.map((invitation) => (
              <div
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border-dark bg-surface-deep p-4"
                key={invitation.invitation_id}
              >
                <div>
                  <Link
                    className="font-semibold text-linen hover:text-court"
                    href={`/people/${invitation.invitee_handle}`}
                  >
                    {invitation.invitee_display_name} · @{invitation.invitee_handle}
                  </Link>
                  <div className="mt-2">
                    <Badge variant="outline">{invitation.status}</Badge>
                  </div>
                </div>
                {invitation.status === "pending" ? (
                  <Button
                    disabled={mutation.isPending}
                    onClick={() => {
                      const data = new FormData();
                      data.set("invitationId", invitation.invitation_id);
                      submit("revoke", data);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Revoke pending invite
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-2xl font-semibold text-linen">Attendance queue</h2>
          <p className="mt-2 text-sm leading-6 text-muted-dark">
            These are factual context signals, not a score. Capacity is checked again inside the
            approval transaction; pending requests do not consume a place.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {attendance.length === 0 ? (
            <p className="text-sm text-muted-dark">No attendance responses yet.</p>
          ) : (
            attendance.map((row) => (
              <div
                className="rounded-2xl border border-border-dark bg-surface-deep p-5"
                key={row.attendance_id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <Link
                      className="font-semibold text-linen hover:text-court"
                      href={`/people/${row.requester_handle}`}
                    >
                      {row.requester_display_name} · @{row.requester_handle}
                    </Link>
                    <p className="mt-1 text-sm text-muted-dark">{row.requester_city_name}</p>
                  </div>
                  <Badge variant="outline">{row.status}</Badge>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <Fact label="Verified" value={row.verified_account ? "Yes" : "No"} />
                  <Fact label="Account age" value={`${row.account_age_days} days`} />
                  <Fact label="Mutual friends" value={String(row.mutual_friend_count)} />
                  <Fact
                    label="Shared active groups"
                    value={String(row.shared_active_group_count)}
                  />
                  <Fact label="Follows sport" value={yesNo(row.follows_sport)} />
                  <Fact label="Follows competition" value={yesNo(row.follows_competition)} />
                  <Fact label="Follows home team" value={yesNo(row.follows_home_team)} />
                  <Fact label="Follows away team" value={yesNo(row.follows_away_team)} />
                </dl>
                {row.status === "requested" && row.review_reason !== null ? (
                  <p className="mt-4 rounded-xl border border-sand/30 bg-sand/10 p-3 text-sm leading-6 text-sand">
                    {row.review_reason}
                  </p>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-2">
                  {row.status === "requested" ? (
                    <>
                      {row.can_approve ? (
                        <DecisionButton
                          attendanceId={row.attendance_id}
                          decision="approve"
                          disabled={mutation.isPending}
                          submit={submit}
                        >
                          Approve
                        </DecisionButton>
                      ) : null}
                      <DecisionButton
                        attendanceId={row.attendance_id}
                        decision="decline"
                        disabled={mutation.isPending}
                        submit={submit}
                        variant="outline"
                      >
                        Decline
                      </DecisionButton>
                    </>
                  ) : null}
                  {row.status === "approved" ? (
                    <RemoveAttendeeControl
                      attendanceId={row.attendance_id}
                      disabled={mutation.isPending}
                      submit={submit}
                    />
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {eventStatus === "published" ? (
        <CancelEventControl disabled={mutation.isPending} submit={submit} />
      ) : null}
    </div>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-dark">{label}</dt>
      <dd className="mt-1 text-linen">{value}</dd>
    </div>
  );
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function DecisionButton({
  attendanceId,
  children,
  decision,
  disabled,
  submit,
  variant,
}: Readonly<{
  attendanceId: string;
  children: ReactNode;
  decision: "approve" | "decline";
  disabled: boolean;
  submit: (intent: MutationIntent, data: FormData) => void;
  variant?: "outline";
}>) {
  return (
    <Button
      className="min-h-11"
      disabled={disabled}
      onClick={() => {
        const data = new FormData();
        data.set("attendanceId", attendanceId);
        data.set("decision", decision);
        submit("review", data);
      }}
      type="button"
      variant={variant}
    >
      {children}
    </Button>
  );
}

function RemoveAttendeeControl({
  attendanceId,
  disabled,
  submit,
}: Readonly<{
  attendanceId: string;
  disabled: boolean;
  submit: (intent: MutationIntent, data: FormData) => void;
}>) {
  const [open, setOpen] = useState(false);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("attendanceId", attendanceId);
    submit("remove", data);
    setOpen(false);
  }
  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button disabled={disabled} type="button" variant="destructive">
          Remove attendee
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this attendee?</AlertDialogTitle>
          <AlertDialogDescription>
            Their row stays in history as removed. Any protected location and calendar access ends
            immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor={`removal-reason-${attendanceId}`}>Reason (optional)</Label>
            <Textarea id={`removal-reason-${attendanceId}`} maxLength={500} name="reason" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep attendee</AlertDialogCancel>
            <Button disabled={disabled} type="submit" variant="destructive">
              Confirm removal
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CancelEventControl({
  disabled,
  submit,
}: Readonly<{
  disabled: boolean;
  submit: (intent: MutationIntent, data: FormData) => void;
}>) {
  const [open, setOpen] = useState(false);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit("cancel", new FormData(event.currentTarget));
    setOpen(false);
  }
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <h2 className="text-xl font-semibold text-linen">Cancel event</h2>
        <p className="mt-2 text-sm text-muted-dark">
          Cancellation is final for this listing. Invitation and attendance history remains.
        </p>
      </CardHeader>
      <CardContent>
        <AlertDialog onOpenChange={setOpen} open={open}>
          <AlertDialogTrigger asChild>
            <Button disabled={disabled} type="button" variant="destructive">
              Cancel event
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this event?</AlertDialogTitle>
              <AlertDialogDescription>
                Attendees immediately lose future protected-location access. Create a new event for
                any material host, audience, place, or address change.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="cancel-reason">Cancellation reason</Label>
                <Textarea id="cancel-reason" maxLength={500} minLength={3} name="reason" required />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep event</AlertDialogCancel>
                <Button disabled={disabled} type="submit" variant="destructive">
                  Confirm cancellation
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

export function EventManagementControls(
  props: Readonly<{
    attendance: EventAttendance[];
    attendanceMode?: "open_door" | "reservations";
    candidates?: readonly EventInvitationCandidate[];
    eventId: string;
    eventStatus: string;
    invitations: EventInvitation[];
    remainingCapacity?: number;
  }>,
) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <EventManagementControlsInner
        {...props}
        attendanceMode={props.attendanceMode ?? "reservations"}
        candidates={props.candidates ?? []}
        remainingCapacity={props.remainingCapacity ?? 0}
      />
    </QueryClientProvider>
  );
}
