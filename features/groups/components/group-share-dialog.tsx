"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
import { InviteCreateControl } from "@/features/groups/components/group-management-controls";

export type GroupShareCandidate = Readonly<{
  id: string;
  handle: string;
  displayName: string;
  context: string;
}>;

export function GroupShareDialog({
  candidates = [],
  canManage,
  groupId,
  groupName,
  groupSlug,
  visibility,
}: Readonly<{
  candidates?: readonly GroupShareCandidate[];
  canManage: boolean;
  groupId: string;
  groupName: string;
  groupSlug: string;
  visibility: "discoverable" | "unlisted";
}>) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const applicationPath = `/groups/${groupSlug}#group-application-heading`;
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedId) ?? null;
  const visibleCandidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en");
    if (normalized === "") return candidates;
    return candidates.filter((candidate) =>
      `${candidate.displayName} ${candidate.handle} ${candidate.context}`
        .toLocaleLowerCase("en")
        .includes(normalized),
    );
  }, [candidates, query]);

  async function copyApplicationLink() {
    await navigator.clipboard.writeText(
      new URL(applicationPath, window.location.origin).toString(),
    );
    setCopied(true);
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setQuery("");
          setSelectedId(null);
          setCopied(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Share group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share {groupName}</DialogTitle>
          <DialogDescription>
            {visibility === "discoverable"
              ? "Share the group page where people can read the summary and apply."
              : "Create a controlled invitation link for a Huddle member without leaving this group."}
          </DialogDescription>
        </DialogHeader>

        {visibility === "discoverable" ? (
          <div className="space-y-4">
            <Input aria-label="Application link" readOnly value={applicationPath} />
            <div className="flex flex-wrap gap-3">
              <Button onClick={copyApplicationLink} type="button">
                {copied ? "Application link copied" : "Copy application link"}
              </Button>
              <Button asChild variant="outline">
                <Link href={applicationPath}>Open application page</Link>
              </Button>
            </div>
          </div>
        ) : canManage ? (
          <div className="space-y-6">
            <div>
              <Label htmlFor="group-share-person-search">Find a Huddle member</Label>
              <Input
                className="mt-2 rounded-full"
                id="group-share-person-search"
                onChange={(event) => setQuery(event.currentTarget.value)}
                role="searchbox"
                value={query}
              />
              <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                {visibleCandidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No eligible person matches this search. You can still create a link and share it
                    privately.
                  </p>
                ) : (
                  visibleCandidates.map((candidate) => (
                    <label
                      className="flex min-h-11 items-start gap-3 rounded-xl border border-border p-3"
                      key={candidate.id}
                    >
                      <input
                        checked={selectedId === candidate.id}
                        className="mt-1 size-5"
                        name="group-share-candidate"
                        onChange={() => setSelectedId(candidate.id)}
                        type="radio"
                      />
                      <span>
                        <span className="block font-semibold text-foreground">
                          {candidate.displayName} · @{candidate.handle}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {candidate.context}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
              {selectedCandidate === null ? null : (
                <p className="mt-3 text-sm font-semibold text-foreground">
                  Link recipient: @{selectedCandidate.handle}. Huddle creates the link here; you
                  choose how to share it privately.
                </p>
              )}
            </div>
            <InviteCreateControl
              buttonLabel="Create invitation link"
              groupId={groupId}
              groupSlug={groupSlug}
            />
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            An owner or admin can create the invitation link for this unlisted group.
          </p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
