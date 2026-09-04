import Link from "next/link";
import { z } from "zod";
import { getVenueBillingWorkspace, getVenueCheckoutReturn } from "@/features/venue-billing/queries";
import { CheckoutConfirmation } from "@/features/venue-billing/components/checkout-confirmation";
import { DomainError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirming checkout — Huddle" };
export default async function CheckoutReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkout_id?: string | string[] }>;
}) {
  let status: "active" | "confirming" | "failed" = "failed";
  const { slug } = await params;
  const parsedSlug = z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .safeParse(slug);
  const billingHref = parsedSlug.success ? `/venues/${parsedSlug.data}/workspace/billing` : "/";
  try {
    const checkoutId = z.uuid().parse((await searchParams).checkout_id);
    const workspace = await getVenueBillingWorkspace(slug);
    status = await getVenueCheckoutReturn(workspace.venueId, checkoutId);
  } catch (error) {
    if (
      !(error instanceof z.ZodError) &&
      (!(error instanceof DomainError) ||
        ["INTERNAL_ERROR", "UPSTREAM_UNAVAILABLE", "VENUE_BILLING_PENDING"].includes(error.code))
    )
      status = "confirming";
    /* Private invalid/mismatched return is never proof of payment. */
  }
  return (
    <section className="mx-auto my-12 max-w-2xl space-y-5 rounded-2xl border border-border bg-card p-6 sm:p-9">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {status === "active"
          ? "Your venue is ready."
          : status === "confirming"
            ? "Confirming your demo subscription…"
            : "Checkout was not completed."}
      </h1>
      <p className="text-sm text-muted-foreground">Polar Sandbox. No real money will be charged.</p>
      {status === "confirming" ? (
        <CheckoutConfirmation billingHref={billingHref} />
      ) : (
        <Link
          className="font-medium text-forest underline underline-offset-4"
          href={status === "active" ? `/venues/${slug}/workspace` : billingHref}
        >
          {status === "active" ? "Open venue workspace" : "Return to Billing"}
        </Link>
      )}
    </section>
  );
}
