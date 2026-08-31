"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  archiveVenueAction,
  type VenueArchiveMutationState,
} from "@/features/venues/workspace/actions";

export function VenueClosureControl({
  venueId,
  venueName,
  venueSlug,
}: Readonly<{ venueId: string; venueName: string; venueSlug: string }>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<VenueArchiveMutationState>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await archiveVenueAction(null, {
        venueId,
        venueName,
        venueSlug,
        confirmation,
      });
      setState(result);
      if (result?.ok === true) {
        setOpen(false);
        // Let the root choose the next surviving workspace. A Venue-only owner may not have a
        // Fan dashboard, while a multi-workspace owner should recover into their next workspace.
        router.replace("/");
        router.refresh();
      }
    });
  }

  return (
    <section aria-labelledby="close-venue-heading" className="mt-14 border-t border-border pt-10">
      <h2 className="text-xl font-semibold text-foreground" id="close-venue-heading">
        Close venue
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Removes this Venue from Huddle and cancels its future events. Past event and attendance
        records stay in the safety history. This cannot be undone here.
      </p>

      <AlertDialog
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setConfirmation("");
        }}
        open={open}
      >
        <AlertDialogTrigger asChild>
          <Button className="mt-5" type="button" variant="destructive">
            Close venue
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {venueName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Fans will no longer find the Venue. All future draft and published events are
              cancelled, and pending invitations are revoked. Type the Venue name exactly to
              confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form className="space-y-5" onSubmit={submit}>
            <div>
              <Label htmlFor="venue-close-confirmation">Venue name</Label>
              <Input
                autoComplete="off"
                id="venue-close-confirmation"
                onChange={(event) => setConfirmation(event.currentTarget.value)}
                value={confirmation}
              />
            </div>
            {state?.ok === false ? (
              <Alert role="alert" variant="destructive">
                <AlertDescription>{state.error.message}</AlertDescription>
              </Alert>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Keep venue</AlertDialogCancel>
              <Button
                disabled={pending || confirmation !== venueName}
                type="submit"
                variant="destructive"
              >
                {pending ? "Closing…" : "Close venue permanently"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
