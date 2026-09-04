import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { BillingStatusBanner } from "@/features/venue-billing/components/billing-status-banner";
import { VenueBillingNavigation } from "@/features/workspaces/components/venue-workspace-header";

import { venueRouteSlugSchema } from "@/features/venues/schemas";
import { getAuthorizedVenueWorkspaceBySlug } from "@/features/workspaces/queries";

type VenueWorkspaceLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<Readonly<{ slug: string }>>;
}>;

export default async function VenueWorkspaceLayout({
  children,
  params,
}: VenueWorkspaceLayoutProps) {
  const parsed = venueRouteSlugSchema.safeParse((await params).slug);
  if (!parsed.success) notFound();
  const workspace = await getAuthorizedVenueWorkspaceBySlug(parsed.data);
  if (workspace === null) notFound();

  return (
    <div className="w-full">
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <p className="font-semibold">{workspace.name}</p>
        <div className="flex flex-wrap items-center gap-4">
          {workspace.billing.isPublic ? (
            <Link
              className="inline-flex min-h-11 items-center text-sm font-medium text-forest underline underline-offset-4"
              href={`/venues/${workspace.slug}`}
            >
              View public page
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">Private venue</p>
          )}
          <VenueBillingNavigation slug={workspace.slug} />
        </div>
      </div>
      <BillingStatusBanner context={workspace.billing} slug={workspace.slug} />
      {children}
    </div>
  );
}
