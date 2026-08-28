import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { EventManagementControls } from "@/features/attendance/components/event-management-controls";
import { listEventAttendance, listEventInvitations } from "@/features/attendance/queries";
import { eventPageSchema } from "@/features/attendance/schemas";
import { getEventSummary } from "@/features/events/queries";
import { eventRouteIdSchema } from "@/features/events/schemas";

export const metadata: Metadata = { title: "Manage event — Huddle" };

type Props = Readonly<{
  params: Promise<Readonly<{ eventId: string }>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function ManageEventPage({ params, searchParams }: Props) {
  const parsedId = eventRouteIdSchema.safeParse((await params).eventId);
  if (!parsedId.success) notFound();
  const event = await getEventSummary(parsedId.data);
  if (event === null || !event.canManage) notFound();

  const rawPage = (await searchParams).page;
  const page = eventPageSchema.parse(Array.isArray(rawPage) ? rawPage[0] : rawPage);
  const [invitations, attendance] = await Promise.all([
    listEventInvitations(event.id, page),
    listEventAttendance(event.id, page),
  ]);
  const total = Math.max(invitations.at(0)?.total_count ?? 0, attendance.at(0)?.total_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / 20));

  return (
    <section className="py-12 sm:py-16">
      <Button asChild variant="ghost">
        <Link href={`/events/${event.id}`}>← Event details</Link>
      </Button>
      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-court">
        Event management
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
        {event.title}
      </h1>
      <p className="mt-4 max-w-3xl text-muted-dark">
        Invite registered supporters, review factual request context, manage approved attendees, and
        retain every participation state.
      </p>

      <div className="mt-10">
        <EventManagementControls
          attendance={attendance}
          eventId={event.id}
          eventStatus={event.status}
          invitations={invitations}
        />
      </div>

      {pageCount > 1 ? (
        <Pagination className="mt-10">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                aria-disabled={page === 1}
                href={page === 1 ? undefined : `?page=${page - 1}`}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-4 text-sm text-muted-dark">
                Page {page} of {pageCount}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                aria-disabled={page >= pageCount}
                href={page >= pageCount ? undefined : `?page=${page + 1}`}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </section>
  );
}
