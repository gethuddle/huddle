"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { discardEventDraftAction } from "@/features/events/actions";
import type { EventDraftSummary } from "@/features/events/drafts";
import { formatIsraelKickoff } from "@/features/sports/time";

export function EventDraftList({ drafts }: Readonly<{ drafts: readonly EventDraftSummary[] }>) {
  const router = useRouter();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removed, setRemoved] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const visible = drafts.filter((draft) => !removed.includes(draft.id));
  function discard(id: string) {
    if (pending || confirmId !== id) return;
    startTransition(async () => {
      setError(null);
      try {
        const result = await discardEventDraftAction({ draftId: id });
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setRemoved((current) => [...current, id]);
        setConfirmId(null);
        setMessage(result.data.message);
        router.refresh();
      } catch {
        setError("We could not discard this draft. Please try again.");
      }
    });
  }
  return (
    <div className="space-y-5">
      {message ? (
        <p role="status" className="text-sm text-forest">
          {message}
        </p>
      ) : null}
      {visible.length === 0 ? (
        <p className="text-muted-foreground">
          No saved drafts on this page. Start an event or choose another page.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {visible.map((draft) => (
            <li key={draft.id} className="space-y-4 p-5">
              <div>
                <h2 className="text-xl font-semibold">
                  {draft.title ??
                    (draft.homeTeamName && draft.awayTeamName
                      ? `${draft.homeTeamName} vs ${draft.awayTeamName}`
                      : "Untitled event draft")}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Step {draft.step} of 3 · Saved {formatIsraelKickoff(draft.savedAt)}
                </p>
                {draft.startsAt ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Match: {formatIsraelKickoff(draft.startsAt)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link href={`/events/new?draft=${draft.id}`}>Resume draft</Link>
                </Button>
                <Button
                  disabled={pending}
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setConfirmId(draft.id);
                    setError(null);
                  }}
                >
                  Discard draft
                </Button>
              </div>
              {confirmId === draft.id ? (
                <section
                  aria-label="Confirm draft discard"
                  className="space-y-3 border-t border-border pt-4"
                >
                  <p>
                    Discard this unfinished draft? Its saved details will be removed. Published
                    events are unaffected.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      disabled={pending}
                      variant="destructive"
                      type="button"
                      onClick={() => discard(draft.id)}
                    >
                      Confirm discard
                    </Button>
                    <Button
                      disabled={pending}
                      variant="outline"
                      type="button"
                      onClick={() => {
                        setConfirmId(null);
                        setError(null);
                      }}
                    >
                      Keep draft
                    </Button>
                  </div>
                  {error ? (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                </section>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
