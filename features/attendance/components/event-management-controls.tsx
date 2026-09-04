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
import { EventInviteLinkPanel } from "@/features/attendance/components/event-invite-link-panel";
import {
  EventInvitationPicker,
  type EventInvitationCandidate,
} from "@/features/attendance/components/event-invitation-picker";
import type {
  EventAttendance,
  EventInvitation,
  EventInviteLink,
} from "@/features/attendance/queries";
import type { AttendanceActionState } from "@/features/attendance/state";

type MutationIntent = "revoke" | "review" | "remove" | "cancel";

function EventManagementControlsInner({
  attendance,
  attendanceMode,
  candidates,
  eventAudience,
  eventId,
  eventStatus,
  inviteLinks,
  invitations,
  remainingCapacity,
  canInvite = true,
  canOperate = true,
}: Readonly<{
  attendance: EventAttendance[];
  attendanceMode: "open_door" | "reservations";
  candidates: readonly EventInvitationCandidate[];
  eventAudience?: "public" | "team_followers" | "group" | "friends" | "invite_only";
  eventId: string;
  eventStatus: string;
  inviteLinks: readonly EventInviteLink[];
  invitations: EventInvitation[];
  remainingCapacity: number;
  canInvite?: boolean;
  canOperate?: boolean;
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
    if (!canOperate) return;
    formData.set("mutationIntent", intent);
    formData.set("eventId", eventId);
    mutation.mutate(formData);
  }

  if (attendanceMode === "open_door") {
    return (
      <div className="space-y-8">
        <AttendanceActionFeedback state={mutation.data} />
        <section className="rounded-xl bg-muted px-5 py-4">
          <h2 className="text-xl font-semibold text-foreground">Open-door event</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Fans simply come to the venue. Huddle does not collect invitations, requests, approvals,
            a guest list, or a capacity count for this event.
          </p>
        </section>
        {canOperate && eventStatus === "published" ? (
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
          <h2 className="text-2xl font-semibold text-foreground">People and attendance</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Invite people, review requests, and manage the current guest list in one place.
          </p>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {eventAudience === "invite_only" && eventStatus === "published" ? (
            <EventInviteLinkPanel eventId={eventId} links={inviteLinks} />
          ) : null}

          <section className="py-6 first:pt-0">
            <h2 className="text-xl font-semibold text-foreground">Invite a specific person</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Choose an existing Huddle account. The invitation appears in that person&apos;s Home
              and My Huddle; nothing is emailed automatically. They still need to accept before a
              place is reserved.
            </p>
            <div className="mt-5">
              {canInvite && eventStatus === "published" ? (
                <EventInvitationPicker
                  candidates={candidates}
                  eventId={eventId}
                  remainingCapacity={remainingCapacity}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  New invitations are unavailable for this event.
                </p>
              )}
            </div>
          </section>

          <section className="py-6">
            <h2 className="text-xl font-semibold text-foreground">Invitations</h2>
            <div className="mt-4 space-y-3">
              {invitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invitations yet.</p>
              ) : (
                invitations.map((invitation) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-muted p-4"
                    key={invitation.invitation_id}
                  >
                    <div>
                      <Link
                        className="font-semibold text-foreground hover:text-forest"
                        href={`/people/${invitation.invitee_handle}`}
                      >
                        {invitation.invitee_display_name} · @{invitation.invitee_handle}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">{invitation.status}</p>
                    </div>
                    {canOperate && invitation.status === "pending" ? (
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
            </div>
          </section>

          <section className="py-6">
            <h2 className="text-xl font-semibold text-foreground">Attendance requests</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Capacity is checked again when you approve. Pending requests do not take a place.
            </p>
            <div className="mt-4 space-y-4">
              {attendance.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attendance responses yet.</p>
              ) : (
                attendance.map((row) => (
                  <div
                    className="rounded-2xl border border-border bg-muted p-5"
                    key={row.attendance_id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <Link
                          className="font-semibold text-foreground hover:text-forest"
                          href={`/people/${row.requester_handle}`}
                        >
                          {row.requester_display_name} · @{row.requester_handle}
                        </Link>
                        <p className="mt-1 text-sm text-muted-foreground"></p>
                      </div>
                      <Badge variant="outline">{row.status}</Badge>
                    </div>
                    {row.status === "requested" ? (
                      <details className="mt-4 rounded-xl border border-border bg-card p-4">
                        <summary className="cursor-pointer font-semibold text-foreground">
                          Why this request is eligible
                        </summary>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          These are context signals only. They are not a score or identity check.
                        </p>
                        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                          <Fact label="Account age" value={`${row.account_age_days} days`} />
                          <Fact label="Mutual friends" value={String(row.mutual_friend_count)} />
                          <Fact
                            label="Shared groups"
                            value={String(row.shared_active_group_count)}
                          />
                          <Fact label="Follows this sport" value={yesNo(row.follows_sport)} />
                          <Fact
                            label="Follows this competition"
                            value={yesNo(row.follows_competition)}
                          />
                          <Fact
                            label="Follows either team"
                            value={yesNo(row.follows_home_team || row.follows_away_team)}
                          />
                        </dl>
                      </details>
                    ) : null}
                    {row.status === "requested" && row.review_reason !== null ? (
                      <p className="mt-4 rounded-xl border border-sand/30 bg-sand/10 p-3 text-sm leading-6 text-sand">
                        {row.review_reason}
                      </p>
                    ) : null}
                    <div className="mt-5 flex flex-wrap gap-2">
                      {canOperate && row.status === "requested" ? (
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
                      {canOperate && row.status === "approved" ? (
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
            </div>
          </section>
        </CardContent>
      </Card>

      {canOperate && eventStatus === "published" ? (
        <CancelEventControl disabled={mutation.isPending} submit={submit} />
      ) : null}
    </div>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground">{value}</dd>
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
    <section className="border-t border-border pt-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Cancel event</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cancellation is final for this listing. Invitation and attendance history remains.
        </p>
      </div>
      <div className="mt-4">
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
      </div>
    </section>
  );
}

export function EventManagementControls(
  props: Readonly<{
    attendance: EventAttendance[];
    attendanceMode?: "open_door" | "reservations";
    candidates?: readonly EventInvitationCandidate[];
    eventAudience?: "public" | "team_followers" | "group" | "friends" | "invite_only";
    eventId: string;
    eventStatus: string;
    inviteLinks?: readonly EventInviteLink[];
    invitations: EventInvitation[];
    remainingCapacity?: number;
    canInvite?: boolean;
    canOperate?: boolean;
  }>,
) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <EventManagementControlsInner
        {...props}
        attendanceMode={props.attendanceMode ?? "reservations"}
        candidates={props.candidates ?? []}
        inviteLinks={props.inviteLinks ?? []}
        remainingCapacity={props.remainingCapacity ?? 0}
      />
    </QueryClientProvider>
  );
}
