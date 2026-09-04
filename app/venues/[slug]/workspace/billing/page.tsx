import Link from "next/link";
import { getVenueBillingWorkspace } from "@/features/venue-billing/queries";
import { VenueBillingPanel } from "@/features/venue-billing/components/venue-billing-panel";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Venue billing — Huddle" };
export default async function VenueBillingPage({ params }: { params: Promise<{ slug: string }> }) {
  let workspace;
  try {
    workspace = await getVenueBillingWorkspace((await params).slug);
  } catch {
    return (
      <ProfileAccessState
        title="Billing is unavailable."
        description="Sign in with an eligible venue account and try again."
        eyebrow="Venue billing"
        actionHref="/auth/sign-in"
        actionLabel="Sign in"
      />
    );
  }
  const { context, name, venueId, slug } = workspace;
  return (
    <section className="mx-auto my-10 max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{name}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Venue billing</h1>
      </div>
      <VenueBillingPanel context={context} venueId={venueId} />
      <Link
        className="font-medium text-forest underline underline-offset-4"
        href={`/venues/${slug}/workspace`}
      >
        Return to workspace
      </Link>
    </section>
  );
}
