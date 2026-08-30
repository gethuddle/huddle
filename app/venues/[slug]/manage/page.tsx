import { notFound, redirect } from "next/navigation";

import { venueRouteSlugSchema } from "@/features/venues/schemas";
import { getAuthorizedVenueWorkspaceBySlug } from "@/features/workspaces/queries";

type ManageVenuePageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
}>;

export default async function ManageVenuePage({ params }: ManageVenuePageProps) {
  const parsedSlug = venueRouteSlugSchema.safeParse((await params).slug);
  if (!parsedSlug.success) notFound();
  const workspace = await getAuthorizedVenueWorkspaceBySlug(parsedSlug.data);
  if (workspace === null) notFound();
  redirect(`/venues/${workspace.slug}/workspace/settings`);
}
