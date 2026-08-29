import { ArrowRight, CalendarDays, UsersRound } from "lucide-react";
import Link from "next/link";

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
import type { MyGroup, MyHuddleEvent } from "@/features/dashboard/queries";
import { formatIsraelKickoff } from "@/features/sports/time";

export function MyHuddleOverview({
  events,
  groups,
  compact = false,
  eventPage = 1,
  groupPage = 1,
}: Readonly<{
  events: readonly MyHuddleEvent[];
  groups: readonly MyGroup[];
  compact?: boolean;
  eventPage?: number;
  groupPage?: number;
}>) {
  const visibleEvents = compact ? events.slice(0, 3) : events;
  const visibleGroups = compact ? groups.slice(0, 3) : groups;
  const eventPageCount = Math.max(1, Math.ceil((events.at(0)?.total_count ?? 0) / 20));
  const groupPageCount = Math.max(1, Math.ceil((groups.at(0)?.total_count ?? 0) / 20));

  return (
    <div className="space-y-12">
      <section aria-labelledby="your-events-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-court">Events</p>
            <h2 className="mt-2 text-2xl font-semibold text-linen" id="your-events-heading">
              Hosting, invitations and attendance
            </h2>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/events">Attendance inbox</Link>
          </Button>
        </div>

        {visibleEvents.length === 0 ? (
          <Card className="mt-5 border-dashed" size="sm">
            <CardContent>
              <p className="font-semibold text-linen">No event activity yet.</p>
              <p className="mt-2 text-sm leading-6 text-muted-dark">
                Events you host, submit, request or accept will stay here.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href="/events/new">Host an event</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/discover">Find an event</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {visibleEvents.map((event) => (
              <Card className="h-full" key={event.event_id} size="sm">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{involvementLabel(event.involvement)}</Badge>
                    <Badge variant="outline">{event.status.replaceAll("_", " ")}</Badge>
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-linen">{event.title}</h3>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <p className="font-medium text-linen">
                    {event.home_team_name} vs {event.away_team_name}
                  </p>
                  <p className="mt-1 text-sm text-muted-dark">{event.competition_name}</p>
                  <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-dark">
                    <CalendarDays aria-hidden="true" className="size-4 text-court" />
                    {formatIsraelKickoff(event.starts_at)} · {event.city_name}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link href={`/events/${event.event_id}`}>
                        Open event <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                    {event.can_manage ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/events/${event.event_id}/manage`}>Manage</Link>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {!compact && eventPageCount > 1 ? (
          <Pagination className="mt-8">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href={
                    eventPage <= 1
                      ? undefined
                      : `?eventsPage=${eventPage - 1}&groupsPage=${groupPage}#your-events-heading`
                  }
                />
              </PaginationItem>
              <PaginationItem>
                <span className="px-4 text-sm text-muted-dark">
                  Page {eventPage} of {eventPageCount}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href={
                    eventPage >= eventPageCount
                      ? undefined
                      : `?eventsPage=${eventPage + 1}&groupsPage=${groupPage}#your-events-heading`
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        ) : null}
      </section>

      <section aria-labelledby="your-groups-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-court">Groups</p>
            <h2 className="mt-2 text-2xl font-semibold text-linen" id="your-groups-heading">
              Groups you belong to
            </h2>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/groups">Browse all groups</Link>
          </Button>
        </div>

        {visibleGroups.length === 0 ? (
          <Card className="mt-5 border-dashed" size="sm">
            <CardContent>
              <p className="font-semibold text-linen">No groups yet.</p>
              <p className="mt-2 text-sm leading-6 text-muted-dark">
                Groups you create or join—including unlisted groups—will stay here.
              </p>
              <Button asChild className="mt-4" size="sm">
                <Link href="/groups/new">Create a group</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleGroups.map((group) => (
              <Card className="h-full" key={group.group_id} size="sm">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{group.member_role}</Badge>
                    <Badge variant="outline">{group.visibility}</Badge>
                    {group.membership_status === "pending" ? (
                      <Badge variant="secondary">application pending</Badge>
                    ) : null}
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-linen">{group.name}</h3>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <p className="line-clamp-2 text-sm leading-6 text-muted-dark">
                    {group.description ?? "No description added yet."}
                  </p>
                  <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-dark">
                    <UsersRound aria-hidden="true" className="size-4 text-court" />
                    {group.active_member_count} active · {group.city_name}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link href={`/groups/${group.slug}`}>
                        Open group <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                    {group.can_manage ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/groups/${group.slug}/manage`}>Manage</Link>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {!compact && groupPageCount > 1 ? (
          <Pagination className="mt-8">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href={
                    groupPage <= 1
                      ? undefined
                      : `?eventsPage=${eventPage}&groupsPage=${groupPage - 1}#your-groups-heading`
                  }
                />
              </PaginationItem>
              <PaginationItem>
                <span className="px-4 text-sm text-muted-dark">
                  Page {groupPage} of {groupPageCount}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href={
                    groupPage >= groupPageCount
                      ? undefined
                      : `?eventsPage=${eventPage}&groupsPage=${groupPage + 1}#your-groups-heading`
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        ) : null}
      </section>

      {compact && (events.length > visibleEvents.length || groups.length > visibleGroups.length) ? (
        <Button asChild variant="outline">
          <Link href="/dashboard">See everything in My Huddle</Link>
        </Button>
      ) : null}
    </div>
  );
}

function involvementLabel(value: MyHuddleEvent["involvement"]): string {
  return {
    hosting: "hosting",
    submitted: "awaiting group review",
    invited: "invited",
    requested: "request pending",
    attending: "attending",
    history: "past activity",
  }[value];
}
