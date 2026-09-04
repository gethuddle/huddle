import { notFound } from "next/navigation";
import { getArchivedVenueBillingContext } from "@/features/venue-billing/queries";
import { ArchivedVenueBillingControl } from "@/features/venue-billing/components/archived-venue-billing-control";

export const dynamic = "force-dynamic";
export const metadata = { title: "Closed venue billing — Huddle" };

export default async function ArchivedVenueBillingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  let context;
  try {
    context = await getArchivedVenueBillingContext((await params).slug);
  } catch {
    notFound();
  }
  return (
    <section className="mx-auto my-10 max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{context.name}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Billing for a closed venue
        </h1>
      </div>
      <p>This venue is closed. Closing it does not cancel its demo subscription.</p>
      <p className="text-sm text-muted-foreground">Polar Sandbox. No real money is charged.</p>
      {context.canOpenPortal ? (
        <ArchivedVenueBillingControl slug={context.slug} />
      ) : (
        <p>There is no current demo subscription to manage.</p>
      )}
    </section>
  );
}
