import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AttentionItem, AttentionKind } from "@/features/attention/types";

const actionLabels: Record<AttentionKind, string> = {
  event_invitation: "Review invitation",
  attendance_request: "Review attendance request",
  friend_request: "Review friend request",
  group_application: "Review group application",
  group_event_submission: "Review group event",
  workspace_setup: "Choose interests",
};

export function AttentionList({ items }: Readonly<{ items: readonly AttentionItem[] }>) {
  return (
    <section aria-labelledby="attention-heading">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-court">
          Current tasks
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-linen" id="attention-heading">
          Needs your attention
        </h2>
      </div>

      {items.length === 0 ? (
        <Card className="mt-5 border-dashed" size="sm">
          <CardContent className="flex items-center gap-3">
            <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-court" />
            <div>
              <p className="font-semibold text-linen">You’re all caught up.</p>
              <p className="mt-1 text-sm text-muted-dark">
                New invitations and requests will appear here only while they need a decision.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-5 grid gap-3">
          {items.map((item) => (
            <Card key={item.key} size="sm">
              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-semibold text-linen">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-dark">{item.description}</p>
                </div>
                <Button asChild className="min-h-11 shrink-0" size="sm" variant="outline">
                  <Link href={item.href}>
                    {actionLabels[item.kind]} <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
