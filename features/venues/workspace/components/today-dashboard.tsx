import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatIsraelKickoff } from "@/features/sports/time";
import type { VenueTodaySnapshot } from "@/features/venues/workspace/types";
import { venueEventHref } from "@/features/venues/workspace/event-links";

type TodayDashboardProps = Readonly<{
  slug: string;
  snapshot: VenueTodaySnapshot;
  canPrepareDrafts?: boolean;
}>;

export function TodayDashboard({ slug, snapshot, canPrepareDrafts = false }: TodayDashboardProps) {
  const next = snapshot.nextEvent;
  const laterToday = snapshot.todayEvents.filter((event) => event.id !== next?.id);

  return (
    <div className="mt-8 space-y-10">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {snapshot.todayEvents.length === 0
            ? "No events today"
            : `${snapshot.todayEvents.length} event${snapshot.todayEvents.length === 1 ? "" : "s"} today`}
        </p>
        <Button asChild size="lg">
          <Link href={`/venues/${slug}/workspace/${canPrepareDrafts ? "plan" : "billing"}`}>
            {canPrepareDrafts ? "Plan events" : "Open Billing"}
          </Link>
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        {next === null ? (
          <EmptyState
            description="Choose one or more future fixtures, assign a viewing area, and save the batch when you are ready."
            title="Nothing is planned yet"
          />
        ) : (
          <Card className="overflow-hidden rounded-3xl border-input bg-card shadow-none">
            <CardHeader className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <span aria-hidden="true" className="size-2 rounded-full bg-court" />
                <Badge variant="outline">Next up</Badge>
                <Badge variant="secondary">{humanStatus(next.status)}</Badge>
              </div>
              <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                {next.title}
              </h2>
              <p className="mt-1 text-muted-foreground">
                {formatIsraelKickoff(next.startsAt)} ·{" "}
                {next.venueSpace?.name ?? "Area not assigned"}
              </p>
            </CardHeader>
            <CardContent className="px-6 pb-6 sm:px-8 sm:pb-8">
              {next.attendanceMode === "open_door" ? (
                <div className="rounded-2xl border border-court/20 bg-court/10 p-4">
                  <p className="font-semibold">Open door · no guest list</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Fans just come along. There are no Huddle requests, invitations, or place counts
                    to manage.
                  </p>
                </div>
              ) : (
                <dl className="grid gap-3 sm:grid-cols-3">
                  <Count label="Confirmed" value={`${next.approvedAttendeeCount} confirmed`} />
                  <Count
                    label="Places"
                    value={`${Math.max((next.capacity ?? 0) - next.approvedAttendeeCount, 0)} remaining`}
                  />
                  <Count label="Requests" value={`${next.waitingAttendeeCount} waiting`} />
                </dl>
              )}
              <Button asChild className="mt-6 rounded-full" variant="outline">
                <Link href={venueEventHref(next.id, slug, "today", next.status === "draft")}>
                  {next.status === "draft" ? "Edit draft" : "Open event"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <AttentionPanel
          attention={snapshot.attention}
          setupTasks={snapshot.setupTasks}
          slug={slug}
        />
      </div>

      {laterToday.length === 0 ? null : (
        <section aria-labelledby="venue-later-today-heading">
          <h2 className="text-2xl font-semibold" id="venue-later-today-heading">
            Later today
          </h2>
          <ol className="mt-4 divide-y divide-border-dark rounded-[1.375rem] border border-border bg-card">
            {laterToday.map((event) => (
              <li key={event.id}>
                <Link
                  className="grid min-h-16 gap-1 p-5 outline-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:grid-cols-[1fr_auto]"
                  href={venueEventHref(event.id, slug, "today", event.status === "draft")}
                >
                  <span className="font-semibold">{event.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatIsraelKickoff(event.startsAt)} · {event.venueSpace?.name ?? "No area"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function AttentionPanel({
  attention,
  setupTasks,
  slug,
}: Readonly<{
  attention: VenueTodaySnapshot["attention"];
  setupTasks: VenueTodaySnapshot["setupTasks"];
  slug: string;
}>) {
  if (attention.length === 0 && setupTasks.length === 0) {
    return (
      <aside className="rounded-3xl border border-border bg-card p-6 sm:p-7">
        <CheckCircle2 aria-hidden="true" className="size-7 text-forest" />
        <h2 className="mt-5 text-2xl font-semibold">All set</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          No attendance requests or venue setup tasks need action.
        </p>
      </aside>
    );
  }

  return (
    <section
      aria-labelledby="venue-attention-heading"
      className="overflow-hidden rounded-3xl border border-border bg-card"
    >
      <div className="p-6 pb-4 sm:px-7">
        <p className="text-sm font-medium text-sand">Action queue</p>
        <h2 className="mt-2 text-2xl font-semibold" id="venue-attention-heading">
          Needs attention
        </h2>
      </div>
      <div className="divide-y divide-border-dark">
        {attention.map((item) => (
          <Link
            className="flex min-h-16 items-center justify-between gap-4 px-6 py-4 outline-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-7"
            href={venueEventHref(item.eventId, slug, "today", true)}
            key={item.eventId}
          >
            <span className="font-semibold">{item.title}</span>
            <span className="text-right text-sm text-sand">
              {item.waitingCount} attendance request{item.waitingCount === 1 ? "" : "s"}
            </span>
          </Link>
        ))}
        {setupTasks.map((task) => (
          <Link
            className="block min-h-16 px-6 py-5 font-semibold outline-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-7"
            href={`/venues/${slug}/workspace/settings`}
            key={task}
          >
            {task}
          </Link>
        ))}
      </div>
    </section>
  );
}

function Count({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-2xl bg-muted p-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-2 font-semibold">{value}</dd>
    </div>
  );
}

function humanStatus(status: string) {
  return status.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}
