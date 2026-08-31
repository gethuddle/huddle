"use client";

import { useActionState, useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  createEventInviteLinkAction,
  revokeEventInviteLinkAction,
} from "@/features/attendance/actions";
import type { EventInviteLink } from "@/features/attendance/queries";
import type { EventInviteLinkActionState } from "@/features/attendance/state";

const INITIAL_STATE: EventInviteLinkActionState = null;

export function EventInviteLinkPanel({
  eventId,
  links,
}: Readonly<{ eventId: string; links: readonly EventInviteLink[] }>) {
  const [state, formAction, creating] = useActionState(createEventInviteLinkAction, INITIAL_STATE);
  const [revoking, startRevocation] = useTransition();
  const [revocationMessage, setRevocationMessage] = useState<string | null>(null);
  const invitePath = state?.ok === true ? state.data.invitePath : undefined;

  return (
    <section className="py-6 first:pt-0">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Share this private event</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          A direct invitation appears in one person&apos;s Huddle. A share link can be sent in any
          messaging app. Anyone using it must sign in, and it only adds an invitation—the person
          still chooses whether to accept.
        </p>
      </div>
      <div className="mt-5 space-y-6">
        <form action={formAction} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input name="eventId" type="hidden" value={eventId} />
          <div>
            <Label htmlFor="event-link-duration">Link expires after</Label>
            <NativeSelect defaultValue="7" id="event-link-duration" name="durationDays">
              <NativeSelectOption value="1">1 day</NativeSelectOption>
              <NativeSelectOption value="7">7 days</NativeSelectOption>
              <NativeSelectOption value="30">30 days</NativeSelectOption>
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="event-link-uses">People who can use it</Label>
            <Input
              defaultValue="10"
              id="event-link-uses"
              max="100"
              min="1"
              name="maxUses"
              type="number"
            />
          </div>
          <Button disabled={creating} type="submit">
            {creating ? "Creating…" : "Create link"}
          </Button>
        </form>

        {state?.ok === false ? (
          <Alert role="alert" variant="destructive">
            <AlertDescription>{state.error.message}</AlertDescription>
          </Alert>
        ) : null}

        {invitePath !== undefined ? <CopyOnceLink invitePath={invitePath} /> : null}

        {links.length > 0 ? (
          <div className="space-y-3 border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-foreground">Recent links</h3>
            {links.map((link) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/50 p-4"
                key={link.invite_token_id}
              >
                <div className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{link.invite_status}</Badge>
                    <span className="text-muted-foreground">
                      {link.use_count} of {link.max_uses} used
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Expires{" "}
                    {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
                      new Date(link.expires_at),
                    )}
                  </p>
                </div>
                {link.invite_status === "active" ? (
                  <Button
                    disabled={revoking}
                    onClick={() => {
                      const data = new FormData();
                      data.set("eventId", eventId);
                      data.set("inviteTokenId", link.invite_token_id);
                      startRevocation(async () => {
                        const result = await revokeEventInviteLinkAction(data);
                        setRevocationMessage(
                          result.ok ? result.data.message : result.error.message,
                        );
                      });
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Revoke
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {revocationMessage === null ? null : (
          <p className="text-sm text-muted-foreground" role="status">
            {revocationMessage}
          </p>
        )}
      </div>
    </section>
  );
}

function CopyOnceLink({ invitePath }: Readonly<{ invitePath: string }>) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const absolute = new URL(invitePath, window.location.origin).toString();
    await navigator.clipboard.writeText(absolute);
    setCopied(true);
  }

  return (
    <div className="rounded-xl border border-court/30 bg-court/10 p-4">
      <p className="text-sm font-semibold text-foreground">Copy this link now</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        The secret is shown once. Existing invitations remain if you later revoke the link.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input aria-label="New invite link" readOnly value={invitePath} />
        <Button onClick={copyLink} type="button" variant="outline">
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}
