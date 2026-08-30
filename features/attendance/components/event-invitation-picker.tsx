"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createEventInvitationsAction } from "@/features/attendance/actions";

export type EventInvitationCandidate = Readonly<{
  id: string;
  handle: string;
  displayName: string;
  context: string;
  eligible: boolean;
  ineligibilityReason: string | null;
}>;

export function EventInvitationPicker({
  candidates,
  eventId,
  remainingCapacity,
}: Readonly<{
  candidates: readonly EventInvitationCandidate[];
  eventId: string;
  remainingCapacity: number;
}>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const limit = Math.max(0, remainingCapacity);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en");
    if (normalized === "") return candidates;
    return candidates.filter((candidate) =>
      `${candidate.displayName} ${candidate.handle} ${candidate.context}`
        .toLocaleLowerCase("en")
        .includes(normalized),
    );
  }, [candidates, query]);

  function toggle(candidate: EventInvitationCandidate) {
    if (!candidate.eligible) return;
    setSelected((current) =>
      current.includes(candidate.id)
        ? current.filter((id) => id !== candidate.id)
        : current.length < limit
          ? [...current, candidate.id]
          : current,
    );
  }

  function submit() {
    if (selected.length === 0) return;
    setFeedback(null);
    setFailed(false);
    startTransition(async () => {
      const result = await createEventInvitationsAction({
        eventId,
        inviteeIds: selected,
      });
      if (!result.ok) {
        setFailed(true);
        setFeedback(result.error.message);
        return;
      }
      setFeedback(result.data.message);
      setSelected([]);
      router.refresh();
    });
  }

  const personLabel = selected.length === 1 ? "person" : "people";

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
          setSelected([]);
          setFeedback(null);
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button disabled={limit === 0} type="button">
          {limit === 0 ? "No places available" : "Invite people"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite eligible people</DialogTitle>
          <DialogDescription>
            Search friends, shared-group supporters, and recent authorized contacts without leaving
            this event.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm font-semibold text-foreground">
          You can select {limit}{" "}
          {limit === 1 ? "person for the remaining place" : "people for the remaining places"}.
        </p>
        <div>
          <Label htmlFor="event-invite-search">Search eligible people</Label>
          <Input
            className="mt-2 rounded-full"
            id="event-invite-search"
            onChange={(event) => setQuery(event.currentTarget.value)}
            role="searchbox"
            value={query}
          />
        </div>

        <div className="max-h-80 space-y-2 overflow-y-auto" role="list">
          {visible.length === 0 ? (
            <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
              No authorized person matches that search.
            </p>
          ) : (
            visible.map((candidate) => {
              const checked = selected.includes(candidate.id);
              const atLimit = selected.length >= limit && !checked;
              return (
                <label
                  className="flex min-h-14 items-start gap-3 rounded-xl border border-border p-4"
                  key={candidate.id}
                >
                  <input
                    aria-label={`${candidate.displayName} @${candidate.handle}`}
                    checked={checked}
                    className="mt-1 size-5 accent-[var(--color-court)]"
                    disabled={!candidate.eligible || atLimit || pending}
                    onChange={() => toggle(candidate)}
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">
                      {candidate.displayName} · @{candidate.handle}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {candidate.ineligibilityReason ?? candidate.context}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>

        {feedback === null ? null : (
          <Alert role={failed ? "alert" : "status"} variant={failed ? "destructive" : "default"}>
            <AlertDescription>{feedback}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button disabled={pending || selected.length === 0} onClick={submit} type="button">
            {pending ? "Sending…" : `Invite ${selected.length} ${personLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
