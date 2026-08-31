import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireActor } from "@/features/auth/actor";
import { EventCreateFlow } from "@/features/events/components/event-create-flow";
import { getPrivateEventCatalog } from "@/features/events/catalog";
import { getEventDraft } from "@/features/events/drafts";
import { eventRouteIdSchema } from "@/features/events/schemas";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { venueRouteSlugSchema } from "@/features/venues/schemas";
import { getVenueCreationViewerState } from "@/features/venues/viewer";
import { getAuthorizedVenueWorkspaceBySlug } from "@/features/workspaces/queries";
import { DomainError } from "@/lib/errors";

export const metadata: Metadata = {
  title: "Host an event — Huddle",
};

type NewEventPageProps = Readonly<{
  searchParams: Promise<
    Readonly<{ draft?: string; group?: string; matchId?: string; venue?: string }>
  >;
}>;

export default async function NewEventPage({ searchParams }: NewEventPageProps) {
  const requested = await searchParams;
  const resumeQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(requested)) {
    if (value !== undefined) resumeQuery.set(key, value);
  }
  const resumePath = `/events/new${resumeQuery.size === 0 ? "" : `?${resumeQuery.toString()}`}`;
  const viewerState = await getVenueCreationViewerState();
  if (viewerState === "anonymous") {
    return (
      <ProfileAccessState
        actionHref={`/auth/sign-in?next=${encodeURIComponent(resumePath)}`}
        actionLabel="Sign in"
        description="Every event host and attendee uses their own signed-in Huddle account."
        eyebrow="Sign in required"
        title="Sign in to host an event."
      />
    );
  }
  if (viewerState === "complete-profile") {
    return (
      <ProfileAccessState
        actionHref={`/settings/profile?next=${encodeURIComponent(resumePath)}`}
        actionLabel="Complete profile"
        description="Verify your email, confirm you are 18+, accept the current rules, and complete your profile before hosting."
        eyebrow="Profile required"
        title="Finish joining before hosting."
      />
    );
  }
  if (viewerState === "not-permitted") {
    return (
      <ProfileAccessState
        description="This account cannot create or manage events."
        eyebrow="Not permitted"
        title="Event hosting is unavailable."
        warning
      />
    );
  }

  if (requested.venue !== undefined) {
    const parsedVenueSlug = venueRouteSlugSchema.safeParse(requested.venue);
    if (!parsedVenueSlug.success) notFound();
    const workspace = await getAuthorizedVenueWorkspaceBySlug(parsedVenueSlug.data);
    if (workspace === null) notFound();
    const parsedMatchId = eventRouteIdSchema.safeParse(requested.matchId);
    const matchQuery = parsedMatchId.success ? `?matchId=${parsedMatchId.data}` : "";
    redirect(`/venues/${workspace.slug}/workspace/plan${matchQuery}`);
  }

  const parsedDraftId = eventRouteIdSchema.safeParse(requested.draft);
  if (requested.draft !== undefined && !parsedDraftId.success) notFound();
  const parsedMatchId = eventRouteIdSchema.safeParse(requested.matchId);
  const ownerDraft = parsedDraftId.success ? await readOwnerDraft(parsedDraftId.data) : null;
  const ownerMatchId = ownerDraft?.draft.values.matchId;
  const catalog = await getPrivateEventCatalog(
    ownerMatchId ?? (parsedMatchId.success ? parsedMatchId.data : undefined),
  );
  const initialMatchId =
    parsedMatchId.success && catalog.matches.some((match) => match.id === parsedMatchId.data)
      ? parsedMatchId.data
      : "";
  const parsedGroupId = eventRouteIdSchema.safeParse(requested.group);
  const requestedGroupId =
    parsedGroupId.success && catalog.groups.some((group) => group.id === parsedGroupId.data)
      ? parsedGroupId.data
      : null;

  return (
    <section className="py-12 sm:py-16">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <p className="text-sm font-medium text-forest">Host an event</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
            Host match day safely.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            Choose the match, say where you&apos;re watching, and choose who can join. Home
            addresses stay hidden until you approve attendance.
          </p>
        </div>
        <aside className="self-start rounded-2xl border border-sand/40 bg-sand/10 p-6">
          <p className="font-semibold text-sand">Everyone joins with their own account</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            You approve each attendee. Home events allow at most 12 people, and Huddle does not use
            anonymous guests or plus-ones.
          </p>
        </aside>
      </div>

      <div className="mt-12 max-w-4xl">
        {catalog.matches.length === 0 ? (
          <ProfileAccessState
            description="Try again after Huddle's fixture list updates."
            eyebrow="Fixture catalog empty"
            title="No future fixture is available yet."
            warning
          />
        ) : (
          <EventCreateFlow
            catalog={catalog}
            initialDraft={ownerDraft?.draft}
            initialMatchId={initialMatchId}
            initialOrganizingGroupId={ownerDraft?.organizingGroupId ?? requestedGroupId}
            initialProtectedLocation={ownerDraft?.protectedLocation}
          />
        )}
      </div>
    </section>
  );
}

async function readOwnerDraft(draftId: string) {
  try {
    const { supabase } = await requireActor("authenticated");
    return await getEventDraft(supabase, draftId);
  } catch (error) {
    if (error instanceof DomainError && error.code !== "INTERNAL_ERROR") notFound();
    throw error;
  }
}
