import { ArrowRight, Bookmark, CalendarDays, UsersRound } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type {
  EventBucket,
  GroupBucket,
  MyGroupInvitation,
  MyEvent,
  MyGroupRelationship,
  SavedBucket,
  SavedItem,
} from "@/features/dashboard/queries";
import { GroupInvitationResponseControl } from "@/features/groups/components/group-management-controls";
import { TeamMark } from "@/features/sports/components/team-initials";
import { formatIsraelKickoff } from "@/features/sports/time";
import {
  collectionHasOverflow,
  collectionPageCount,
  collectionVisibleTotal,
} from "@/lib/pagination";

type CollectionState = Readonly<{
  eventBucket: EventBucket;
  eventPage: number;
  groupBucket: GroupBucket;
  groupPage: number;
  savedBucket: SavedBucket;
  savedPage: number;
}>;

export function MyHuddleOverview({
  events,
  groups,
  groupInvitations = [],
  saved,
  eventBucket,
  groupBucket,
  savedBucket,
  eventPage = 1,
  groupPage = 1,
  savedPage = 1,
}: Readonly<{
  events: readonly MyEvent[];
  groups: readonly MyGroupRelationship[];
  groupInvitations?: readonly MyGroupInvitation[];
  saved: readonly SavedItem[];
  eventBucket: EventBucket;
  groupBucket: GroupBucket;
  savedBucket: SavedBucket;
  eventPage?: number;
  groupPage?: number;
  savedPage?: number;
}>) {
  const state: CollectionState = {
    eventBucket,
    eventPage,
    groupBucket,
    groupPage,
    savedBucket,
    savedPage,
  };
  const hasCustomFilters =
    eventBucket !== "upcoming" || groupBucket !== "all" || savedBucket !== "all";

  return (
    <div className="space-y-14">
      <details
        className="rounded-xl border border-border bg-card px-5 py-4"
        open={hasCustomFilters}
      >
        <summary className="cursor-pointer font-semibold text-foreground">
          Filter My Huddle
          <span className="ml-2 font-normal text-muted-foreground">
            · {eventBucket} events · {groupBucket} groups · {savedBucket} saved
          </span>
        </summary>
        <form
          action="/dashboard"
          className="mt-5 grid gap-5 border-t border-border pt-5 md:grid-cols-3"
          method="get"
        >
          <FilterSelect
            id="eventBucket"
            label="Show events"
            name="eventBucket"
            options={[
              ["upcoming", "Upcoming"],
              ["hosting", "Hosting"],
              ["pending", "Pending"],
              ["history", "History"],
            ]}
            value={eventBucket}
          />
          <FilterSelect
            id="groupBucket"
            label="Show groups"
            name="groupBucket"
            options={[
              ["all", "All groups"],
              ["member", "Member"],
              ["owner", "Owner"],
              ["admin", "Admin"],
              ["applying", "Applying"],
            ]}
            value={groupBucket}
          />
          <FilterSelect
            id="savedBucket"
            label="Show saved items"
            name="savedBucket"
            options={[
              ["all", "All saved"],
              ["team", "Teams"],
              ["competition", "Competitions"],
              ["sport", "Sports"],
              ["venue", "Venues"],
            ]}
            value={savedBucket}
          />
          <Button
            className="min-h-11 rounded-full md:col-span-3 md:justify-self-start"
            type="submit"
          >
            Apply filters
          </Button>
        </form>
      </details>

      <EventCollection events={events} state={state} />
      <GroupInvitationCollection invitations={groupInvitations} />
      <GroupCollection groups={groups} state={state} />
      <SavedCollection items={saved} state={state} />
    </div>
  );
}

function GroupInvitationCollection({
  invitations,
}: Readonly<{ invitations: readonly MyGroupInvitation[] }>) {
  if (invitations.length === 0) return null;

  return (
    <section aria-labelledby="group-invitations-heading" id="group-invitations">
      <CollectionHeading
        eyebrow="Invitations"
        id="group-invitations-heading"
        title="Groups waiting for you"
      />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {invitations.map((invitation) => (
          <Card key={invitation.id} size="sm">
            <CardHeader>
              <h3 className="text-xl font-semibold text-foreground">{invitation.groupName}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                @{invitation.inviterHandle} invited you. Joining makes you an active member;
                declining removes this invitation.
              </p>
            </CardHeader>
            <CardContent>
              <GroupInvitationResponseControl
                groupSlug={invitation.groupSlug}
                invitationId={invitation.id}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function FilterSelect({
  id,
  label,
  name,
  options,
  value,
}: Readonly<{
  id: string;
  label: string;
  name: string;
  options: readonly (readonly [string, string])[];
  value: string;
}>) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select
        className="mt-2 h-11 w-full rounded-full border border-input bg-secondary px-4 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        defaultValue={value}
        id={id}
        name={name}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

function EventCollection({
  events,
  state,
}: Readonly<{ events: readonly MyEvent[]; state: CollectionState }>) {
  const totalCount = events.at(0)?.totalCount ?? 0;
  const pageCount = collectionPageCount(totalCount);
  const emptyCopy: Record<EventBucket, readonly [string, string]> = {
    upcoming: ["No upcoming huddles.", "Accepted events will stay here until match day."],
    hosting: [
      "Nothing you’re hosting yet.",
      "Plan a huddle when you are ready to bring people together.",
    ],
    pending: [
      "Nothing is waiting.",
      "Requests and group submissions appear here only while pending.",
    ],
    history: [
      "No attended or hosted history.",
      "Declined, removed, revoked and merely invited events never become history.",
    ],
  };

  return (
    <section aria-labelledby="your-events-heading">
      <CollectionHeading
        eyebrow="Events"
        id="your-events-heading"
        title={state.eventBucket === "history" ? "Event history" : "Your events"}
      />
      {state.eventBucket !== "history" ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Completed and cancelled events stay out of sight unless you choose History.
        </p>
      ) : null}

      {events.length === 0 ? (
        <CollectionEmpty copy={emptyCopy[state.eventBucket]}>
          <Button asChild className="min-h-11" size="sm">
            <Link href="/events/new">Plan a huddle</Link>
          </Button>
          <Button asChild className="min-h-11" size="sm" variant="outline">
            <Link href="/discover">Explore events</Link>
          </Button>
        </CollectionEmpty>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {events.map((event) => (
            <Card className="h-full" key={event.id} size="sm">
              <CardHeader>
                <p className="text-xs text-muted-foreground">
                  {event.relationshipLabel} · {event.status.replaceAll("_", " ")}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-foreground">{event.title}</h3>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <div className="flex items-center gap-3">
                  <TeamMark
                    crestUrl={event.homeTeamCrestUrl}
                    name={event.homeTeamName}
                    size="sm"
                    tla={event.homeTeamTla}
                  />
                  <p className="min-w-0 font-medium text-foreground">
                    {event.homeTeamName} vs {event.awayTeamName}
                  </p>
                  <TeamMark
                    crestUrl={event.awayTeamCrestUrl}
                    name={event.awayTeamName}
                    size="sm"
                    tla={event.awayTeamTla}
                  />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{event.competitionName}</p>
                <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays aria-hidden="true" className="size-4 text-forest" />
                  {formatIsraelKickoff(event.startsAt)}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild className="min-h-11" size="sm" variant="outline">
                    <Link href={`/events/${event.id}`}>
                      Open event <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                  {event.canManage ? (
                    <Button asChild className="min-h-11" size="sm" variant="ghost">
                      <Link href={`/events/${event.id}/manage`}>Manage</Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {collectionHasOverflow(totalCount) ? (
        <BoundedWindowCopy label="events" totalCount={totalCount} />
      ) : null}
      <CollectionPagination
        anchor="your-events-heading"
        currentPage={state.eventPage}
        pageCount={pageCount}
        state={state}
        target="events"
      />
    </section>
  );
}

function GroupCollection({
  groups,
  state,
}: Readonly<{ groups: readonly MyGroupRelationship[]; state: CollectionState }>) {
  const totalCount = groups.at(0)?.totalCount ?? 0;
  const pageCount = collectionPageCount(totalCount);
  return (
    <section aria-labelledby="your-groups-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <CollectionHeading eyebrow="Groups" id="your-groups-heading" title="Your groups" />
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11" size="sm">
            <Link href="/groups/new">Create group</Link>
          </Button>
          <Button asChild className="min-h-11" size="sm" variant="outline">
            <Link href="/groups">Find groups</Link>
          </Button>
        </div>
      </div>
      {groups.length === 0 ? (
        <CollectionEmpty
          copy={[
            state.groupBucket === "applying"
              ? "No applications in progress."
              : "No groups in this role.",
            "Create a group or browse discoverable communities when you want to join one.",
          ]}
        />
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <Card className="h-full" key={group.id} size="sm">
              <CardHeader>
                <p className="text-xs text-muted-foreground">
                  {group.role ?? "Application pending"} ·{" "}
                  {group.visibility === "unlisted" ? "Private" : "Discoverable"}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-foreground">{group.name}</h3>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                {group.description === null ? null : (
                  <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {group.description}
                  </p>
                )}
                <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <UsersRound aria-hidden="true" className="size-4 text-forest" />
                  {group.activeMemberCount === null
                    ? "Application pending"
                    : `${group.activeMemberCount} active`}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild className="min-h-11" size="sm" variant="outline">
                    <Link href={`/groups/${group.slug}`}>Open group</Link>
                  </Button>
                  {group.canManage ? (
                    <Button asChild className="min-h-11" size="sm" variant="ghost">
                      <Link href={`/groups/${group.slug}/manage`}>Manage</Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {collectionHasOverflow(totalCount) ? (
        <BoundedWindowCopy label="groups" totalCount={totalCount} />
      ) : null}
      <CollectionPagination
        anchor="your-groups-heading"
        currentPage={state.groupPage}
        pageCount={pageCount}
        state={state}
        target="groups"
      />
    </section>
  );
}

function SavedCollection({
  items,
  state,
}: Readonly<{ items: readonly SavedItem[]; state: CollectionState }>) {
  const totalCount = items.at(0)?.totalCount ?? 0;
  const pageCount = collectionPageCount(totalCount);
  return (
    <section aria-labelledby="your-saved-heading">
      <CollectionHeading
        eyebrow="Saved"
        id="your-saved-heading"
        title="Teams, competitions and places"
      />
      {items.length === 0 ? (
        <CollectionEmpty
          copy={[
            "Nothing saved in this filter.",
            "Follow teams, competitions and venues to make recommendations feel personal.",
          ]}
        >
          <Button asChild className="min-h-11" size="sm">
            <Link href="/settings/interests">Choose interests</Link>
          </Button>
        </CollectionEmpty>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Card key={`${item.kind}:${item.id}`} size="sm">
              <CardContent>
                <div className="flex items-center gap-2">
                  <Bookmark aria-hidden="true" className="size-4 text-forest" />
                  <span className="text-xs text-muted-foreground">{item.kind}</span>
                  {item.kind === "team" ? (
                    <TeamMark
                      className="ml-auto"
                      crestUrl={item.crestUrl}
                      name={item.label}
                      size="sm"
                      tla={item.tla}
                    />
                  ) : null}
                </div>
                <h3 className="mt-3 text-lg font-semibold text-foreground">{item.label}</h3>
                {item.detail === null ? null : (
                  <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                )}
                <Button asChild className="mt-5 min-h-11" size="sm" variant="outline">
                  <Link href={item.href}>Open {item.label}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {collectionHasOverflow(totalCount) ? (
        <BoundedWindowCopy label="saved items" totalCount={totalCount} />
      ) : null}
      <CollectionPagination
        anchor="your-saved-heading"
        currentPage={state.savedPage}
        pageCount={pageCount}
        state={state}
        target="saved"
      />
    </section>
  );
}

function CollectionHeading({
  eyebrow,
  id,
  title,
}: Readonly<{ eyebrow: string; id: string; title: string }>) {
  return (
    <div>
      <p className="text-sm font-medium text-forest">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold text-foreground" id={id}>
        {title}
      </h2>
    </div>
  );
}

function BoundedWindowCopy({ label, totalCount }: Readonly<{ label: string; totalCount: number }>) {
  return (
    <p className="mt-4 text-sm text-muted-foreground">
      Showing the first {collectionVisibleTotal(totalCount).toLocaleString("en-US")} {label}. Use
      the filters to narrow the collection.
    </p>
  );
}

function CollectionEmpty({
  children,
  copy,
}: Readonly<{ children?: React.ReactNode; copy: readonly [string, string] }>) {
  return (
    <Card className="mt-5 border-dashed" size="sm">
      <CardContent>
        <p className="font-semibold text-foreground">{copy[0]}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy[1]}</p>
        {children === undefined ? null : (
          <div className="mt-4 flex flex-wrap gap-2">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

function collectionHref(
  state: CollectionState,
  target: "events" | "groups" | "saved",
  page: number,
  anchor: string,
): string {
  const params = new URLSearchParams({
    eventBucket: state.eventBucket,
    eventsPage: String(target === "events" ? page : state.eventPage),
    groupBucket: state.groupBucket,
    groupsPage: String(target === "groups" ? page : state.groupPage),
    savedBucket: state.savedBucket,
    savedPage: String(target === "saved" ? page : state.savedPage),
  });
  return `?${params.toString()}#${anchor}`;
}

function CollectionPagination({
  anchor,
  currentPage,
  pageCount,
  state,
  target,
}: Readonly<{
  anchor: string;
  currentPage: number;
  pageCount: number;
  state: CollectionState;
  target: "events" | "groups" | "saved";
}>) {
  if (pageCount <= 1) return null;
  return (
    <Pagination className="mt-8">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={
              currentPage <= 1 ? undefined : collectionHref(state, target, currentPage - 1, anchor)
            }
          />
        </PaginationItem>
        <PaginationItem>
          <span className="px-4 text-sm text-muted-foreground">
            Page {currentPage} of {pageCount}
          </span>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext
            href={
              currentPage >= pageCount
                ? undefined
                : collectionHref(state, target, currentPage + 1, anchor)
            }
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
