import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { VenueVerificationBadge } from "@/features/venues/components/venue-verification-badge";
import { venueRouteSlugSchema } from "@/features/venues/schemas";
import { VenueSettingsForm } from "@/features/venues/workspace/components/venue-settings-form";
import { VenueClosureControl } from "@/features/venues/workspace/components/venue-closure-control";
import { VenueSpaceEditor } from "@/features/venues/workspace/components/venue-space-editor";
import { getVenueSettings } from "@/features/venues/workspace/queries";
import { getAuthorizedVenueWorkspaceBySlug } from "@/features/workspaces/queries";

type VenueSettingsPageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
}>;

export default async function VenueSettingsPage({ params }: VenueSettingsPageProps) {
  const parsed = venueRouteSlugSchema.safeParse((await params).slug);
  if (!parsed.success) notFound();
  const workspace = await getAuthorizedVenueWorkspaceBySlug(parsed.data);
  if (workspace === null) notFound();
  const settings = await getVenueSettings(workspace.id);
  if (settings === null) notFound();

  return (
    <section className="py-10 sm:py-14">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-sm font-medium text-forest">Venue workspace</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Venue profile
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            The reusable public details and defaults behind every event you plan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <VenueVerificationBadge status={workspace.verificationStatus} />
          <Button asChild variant="outline">
            <Link href={`/venues/${workspace.slug}`}>View public page</Link>
          </Button>
        </div>
      </div>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-14">
        <VenueSettingsForm
          venue={{
            id: settings.id,
            slug: settings.slug,
            name: settings.name,
            addressText: settings.addressText,
            description: settings.description,
            facilities: settings.facilities,
            houseInformation: settings.houseInformation,
            defaultAttendanceMode: settings.defaultAttendanceMode,
            defaultRequiresApproval: settings.defaultRequiresApproval,
          }}
        />

        <aside className="sticky top-28 overflow-hidden rounded-3xl border border-input bg-card">
          <div className="flex h-40 items-center justify-center bg-muted">
            <span className="text-4xl font-semibold tracking-[-0.06em] text-forest/70">
              {initials(settings.name)}
            </span>
          </div>
          <div className="p-6">
            <p className="text-sm font-medium text-muted-foreground">How fans see you</p>
            <h2 className="mt-3 text-xl font-semibold">{settings.name}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{settings.addressText}</p>
            <p className="mt-4 line-clamp-4 text-sm leading-6 text-muted-foreground">
              {settings.description}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {settings.facilities.slice(0, 4).map((facility) => (
                <span
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
                  key={facility}
                >
                  {humanFacility(facility)}
                </span>
              ))}
            </div>
            <p className="mt-5 border-t border-border pt-5 text-sm font-semibold text-foreground">
              {settings.defaultAttendanceMode === "open_door"
                ? "Open door by default · no reservation"
                : settings.defaultRequiresApproval
                  ? "Reservations · staff approval"
                  : "Reservations · instant joining"}
            </p>
          </div>
        </aside>
      </div>

      <section aria-labelledby="venue-spaces-heading" className="mt-14 max-w-4xl">
        <h2 className="text-2xl font-semibold" id="venue-spaces-heading">
          Viewing areas
        </h2>
        <p className="mt-2 text-muted-foreground">
          Reservation events snapshot the chosen capacity. Open-door events need only an active
          area; later changes affect only newly planned events.
        </p>
        <div className="mt-5 space-y-4">
          {settings.spaces.map((space, index) => (
            <VenueSpaceEditor
              key={space.id}
              sortOrder={index}
              space={space}
              venueId={settings.id}
            />
          ))}
          <VenueSpaceEditor sortOrder={settings.spaces.length} venueId={settings.id} />
        </div>
      </section>

      {workspace.role === "owner" ? (
        <VenueClosureControl
          venueId={settings.id}
          venueName={settings.name}
          venueSlug={settings.slug}
        />
      ) : null}
    </section>
  );
}

function initials(label: string) {
  return label
    .split(/\s+/u)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function humanFacility(facility: string) {
  return facility.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}
