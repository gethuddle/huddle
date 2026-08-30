import { ArrowRight, Bookmark, CalendarDays, UsersRound } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
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
  MyEvent,
  MyGroupRelationship,
  SavedBucket,
  SavedItem,
} from "@/features/dashboard/queries";
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

  return (
    <div className="space-y-14">
      <form
        action="/dashboard"
        className="grid gap-5 rounded-[1.375rem] border border-border-dark bg-surface-raised p-5 md:grid-cols-3"
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
        <Button className="min-h-11 rounded-full md:col-span-3 md:justify-self-start" type="submit">
          Apply filters
        </Button>
      </form>

      <EventCollection events={events} state={state} />
      <GroupCollection groups={groups} state={state} />
      <SavedCollection items={saved} state={state} />
    </div>
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
        <p className="mt-2 text-sm text-muted-dark">
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
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{event.relationshipLabel}</Badge>
                  <Badge variant="outline">{event.status.replaceAll("_", " ")}</Badge>
                </div>
                <h3 className="mt-2 text-xl font-semibold text-linen">{event.title}</h3>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <p className="font-medium text-linen">
                  {event.homeTeamName} vs {event.awayTeamName}
                </p>
                <p className="mt-1 text-sm text-muted-dark">{event.competitionName}</p>
                <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-dark">
                  <CalendarDays aria-hidden="true" className="size-4 text-court" />
                  {formatIsraelKickoff(event.startsAt)} · {event.cityName}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild className="min-h-11" size="sm">
                    <Link href={`/events/${event.id}`}>
                      Open event <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                  {event.canManage ? (
                    <Button asChild className="min-h-11" size="sm" variant="outline">
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
      <CollectionHeading eyebrow="Groups" id="your-groups-heading" title="Your groups" />
      {groups.length === 0 ? (
        <CollectionEmpty
          copy={[
            state.groupBucket === "applying"
              ? "No applications in progress."
              : "No groups in this role.",
            "Create a group or browse discoverable communities when you want to join one.",
          ]}
        >
          <Button asChild className="min-h-11" size="sm">
            <Link href="/groups/new">Create a group</Link>
          </Button>
          <Button asChild className="min-h-11" size="sm" variant="outline">
            <Link href="/groups">Browse groups</Link>
          </Button>
        </CollectionEmpty>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <Card className="h-full" key={group.id} size="sm">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{group.role ?? "application pending"}</Badge>
                  <Badge variant="outline">{group.visibility}</Badge>
                </div>
                <h3 className="mt-2 text-xl font-semibold text-linen">{group.name}</h3>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                {group.description === null ? null : (
                  <p className="line-clamp-2 text-sm leading-6 text-muted-dark">
                    {group.description}
                  </p>
                )}
                <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-dark">
                  <UsersRound aria-hidden="true" className="size-4 text-court" />
                  {group.activeMemberCount === null
                    ? `${group.cityName} · Application pending`
                    : `${group.activeMemberCount} active · ${group.cityName}`}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild className="min-h-11" size="sm">
                    <Link href={`/groups/${group.slug}`}>Open group</Link>
                  </Button>
                  {group.canManage ? (
                    <Button asChild className="min-h-11" size="sm" variant="outline">
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
                  <Bookmark aria-hidden="true" className="size-4 text-court" />
                  <Badge variant="outline">{item.kind}</Badge>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-linen">{item.label}</h3>
                {item.detail === null ? null : (
                  <p className="mt-1 text-sm text-muted-dark">{item.detail}</p>
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
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-court">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold text-linen" id={id}>
        {title}
      </h2>
    </div>
  );
}

function BoundedWindowCopy({ label, totalCount }: Readonly<{ label: string; totalCount: number }>) {
  return (
    <p className="mt-4 text-sm text-muted-dark">
      Showing the first {collectionVisibleTotal(totalCount).toLocaleString("en-US")} {label}. Use
      the filters to narrow the collection.
    </p>
  );
}

function CollectionEmpty({
  children,
  copy,
}: Readonly<{ children: React.ReactNode; copy: readonly [string, string] }>) {
  return (
    <Card className="mt-5 border-dashed" size="sm">
      <CardContent>
        <p className="font-semibold text-linen">{copy[0]}</p>
        <p className="mt-2 text-sm leading-6 text-muted-dark">{copy[1]}</p>
        <div className="mt-4 flex flex-wrap gap-2">{children}</div>
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
          <span className="px-4 text-sm text-muted-dark">
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
