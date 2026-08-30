import { notFound } from "next/navigation";
import type { ReactNode } from "react";

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

  return <div className="w-full">{children}</div>;
}
