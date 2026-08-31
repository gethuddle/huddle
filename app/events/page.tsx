import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { EventParticipationControls } from "@/features/attendance/components/event-participation-controls";
import { listMyEventParticipation } from "@/features/attendance/queries";
import { requireActor } from "@/features/auth/actor";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { formatIsraelKickoff } from "@/features/sports/time";
import { DomainError } from "@/lib/errors";
import { collectionPageCount, collectionPageInput } from "@/lib/pagination";

export const metadata: Metadata = { title: "Attendance — Huddle" };

type Props = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function EventsDashboardPage({ searchParams }: Props) {
  const rawPage = (await searchParams).page;
  const pageInput = collectionPageInput(Array.isArray(rawPage) ? rawPage[0] : rawPage);
  if (pageInput.wasAboveWindow) {
    redirect(`/events?page=${pageInput.page}#attendance-inbox`);
  }
  const page = pageInput.page;

  try {
    await requireActor("fan");
  } catch (error) {
    if (error instanceof DomainError && error.code === "AUTH_REQUIRED") {
      return (
        <ProfileAccessState
          actionHref="/auth/sign-in"
          actionLabel="Sign in"
          description="Invitations and attendance belong to your signed-in Huddle account."
          eyebrow="Sign in required"
          title="Sign in to view your events."
        />
      );
    }
    if (error instanceof DomainError && error.code !== "INTERNAL_ERROR") {
      return (
        <ProfileAccessState
          actionHref="/settings/profile"
          actionLabel="Review profile"
          description="Confirm your email, confirm you are 18+, accept the current rules, and complete your profile."
          eyebrow="Profile required"
          title="Finish joining before managing attendance."
          warning={error.code === "ACCOUNT_SUSPENDED"}
        />
      );
    }
    throw error;
  }

  const items = await listMyEventParticipation(page);
  const total = items.at(0)?.total_count ?? 0;
  const pageCount = collectionPageCount(total);
  if (page > 1 && items.length === 0) {
    const firstItems = await listMyEventParticipation(1);
    const finalPage = collectionPageCount(firstItems.at(0)?.total_count ?? 0);
    if (page > finalPage) redirect(`/events?page=${finalPage}#attendance-inbox`);
  }

  return (
    <section className="py-12 sm:py-16" id="attendance-inbox">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-medium text-forest">Attendance inbox</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
            Invitations and requests
          </h1>
          <p className="mt-4 max-w-3xl text-muted-foreground">
            Every response represents your own registered place. There are no anonymous guests or
            plus-ones.
          </p>
        </div>
        <Button asChild>
          <Link href="/discover">Discover events</Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          description="Eligible invitations and attendance responses for upcoming events will appear here."
          headingLevel="h2"
          title="No invitations or attendance requests yet."
        />
      ) : (
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {items.map((item) => (
            <Card key={item.event_id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-forest">{item.competition_name}</p>
                  <Badge variant="outline">
                    {item.attendance_status ?? item.invitation_status ?? "invited"}
                  </Badge>
                </div>
                <h2 className="mt-3 text-2xl font-semibold text-foreground">{item.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {item.home_team_name} vs {item.away_team_name}
                </p>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {formatIsraelKickoff(item.starts_at)} · {item.city_name}
                </p>
                <div className="mt-5">
                  <EventParticipationControls
                    canManage={false}
                    eventId={item.event_id}
                    eventStatus="published"
                    hostKind={item.host_kind}
                    remainingCapacity={item.remaining_capacity}
                    requiresApproval={item.requires_approval}
                    viewerAttendanceId={item.attendance_id}
                    viewerAttendanceStatus={item.attendance_status}
                    viewerInvitationId={item.invitation_id}
                    viewerInvitationStatus={item.invitation_status}
                    viewerIsAuthenticated
                  />
                </div>
                <Button asChild className="mt-3 w-full" variant="ghost">
                  <Link href={`/events/${item.event_id}`}>Open event details</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <Pagination className="mt-10">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                aria-disabled={page === 1}
                href={page > 1 ? `?page=${page - 1}#attendance-inbox` : undefined}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-4 text-sm text-muted-foreground">
                Page {page} of {pageCount}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                aria-disabled={page >= pageCount}
                href={page < pageCount ? `?page=${page + 1}#attendance-inbox` : undefined}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </section>
  );
}
