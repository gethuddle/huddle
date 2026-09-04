import { notFound } from "next/navigation";

import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { getVenueEventCatalog } from "@/features/events/catalog";
import { eventRouteIdSchema } from "@/features/events/schemas";
import { venueRouteSlugSchema } from "@/features/venues/schemas";
import { FixturePlanner } from "@/features/venues/workspace/components/fixture-planner";
import { getVenueSettings } from "@/features/venues/workspace/queries";
import { getAuthorizedVenueWorkspaceBySlug } from "@/features/workspaces/queries";

type VenuePlanPageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
  searchParams: Promise<Readonly<{ matchId?: string }>>;
}>;

export default async function VenuePlanPage({ params, searchParams }: VenuePlanPageProps) {
  const parsedSlug = venueRouteSlugSchema.safeParse((await params).slug);
  if (!parsedSlug.success) notFound();
  const workspace = await getAuthorizedVenueWorkspaceBySlug(parsedSlug.data);
  if (workspace === null) notFound();
  const requested = await searchParams;
  const parsedMatch = eventRouteIdSchema.safeParse(requested.matchId);
  const [settings, catalog] = await Promise.all([
    getVenueSettings(workspace.id),
    getVenueEventCatalog(parsedMatch.success ? parsedMatch.data : undefined),
  ]);
  if (settings === null) notFound();

  const initialMatchId =
    parsedMatch.success && catalog.matches.some((match) => match.id === parsedMatch.data)
      ? parsedMatch.data
      : "";

  return (
    <section className="py-10 sm:py-14">
      <p className="text-sm font-medium text-sand">Venue workspace</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-4xl">Plan events</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Find the fixtures you will show, then publish them together using your Venue defaults.
      </p>

      <div className="mt-10">
        {catalog.matches.length === 0 ? (
          <ProfileAccessState
            description="Try again after Huddle's fixture list updates. Your Venue settings are unchanged."
            eyebrow="No future fixtures"
            title="There is nothing to plan yet."
            warning
          />
        ) : (
          <FixturePlanner
            billing={{
              canPublish: workspace.billing.canPublish,
              canPrepareDrafts: workspace.billing.canPrepareDrafts,
              publishCutoffAt: workspace.billing.publishCutoffAt,
              blockedReason: "Publishing is unavailable. You can save drafts and check Billing.",
            }}
            catalog={catalog}
            initialMatchId={initialMatchId}
            venue={{
              id: settings.id,
              slug: settings.slug,
              name: settings.name,
              addressText: settings.addressText,
              houseInformation: settings.houseInformation,
              defaultAttendanceMode: settings.defaultAttendanceMode,
              defaultRequiresApproval: settings.defaultRequiresApproval,
              spaces: settings.spaces,
            }}
          />
        )}
      </div>
    </section>
  );
}
