import "server-only";
import { z } from "zod";
import { cache } from "react";
import type { VenueBillingContext } from "./types";
import { requireActor } from "@/features/auth/actor";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getCheckoutContext } from "./database";
import { billingContextSchema, archivedVenueBillingContextSchema } from "./schemas";

export async function getArchivedVenueBillingContext(slug: string) {
  const { supabase } = await requireActor("common");
  const { data, error } = await supabase.rpc("get_archived_venue_billing_context", {
    input_slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .parse(slug),
  });
  if (error) throw domainErrorFromDatabase(error);
  const parsed = archivedVenueBillingContextSchema.safeParse(data);
  if (!parsed.success) throw new DomainError("INTERNAL_ERROR");
  return parsed.data;
}

export const getVenueBillingContext = cache(
  async (venueId: string): Promise<VenueBillingContext> => {
    // This RPC performs the common-actor and concrete Venue membership checks
    // itself. Avoid repeating Auth and profile reads before that authoritative
    // database boundary.
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_venue_billing_context", {
      input_venue_id: z.uuid().parse(venueId),
    });
    if (error) throw domainErrorFromDatabase(error);
    const parsed = billingContextSchema.safeParse(data);
    if (!parsed.success) throw new DomainError("INTERNAL_ERROR");
    return parsed.data;
  },
);

export async function getVenueBillingWorkspace(slug: string) {
  const { supabase } = await requireActor("common");
  const { data, error } = await supabase.rpc("list_my_workspaces");
  if (error) throw domainErrorFromDatabase(error);
  const selected = data.find((w) => w.workspace_kind === "venue" && w.slug === slug);
  if (!selected) throw new DomainError("NOT_FOUND");
  const workspace = z
    .object({
      workspace_id: z.uuid(),
      name: z.string().min(1),
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    })
    .parse(selected);
  return {
    venueId: workspace.workspace_id,
    name: workspace.name,
    slug: workspace.slug,
    context: await getVenueBillingContext(workspace.workspace_id),
  };
}

export async function getVenueCheckoutReturn(
  venueId: string,
  checkoutId: string,
): Promise<"confirming" | "active" | "failed"> {
  const { user } = await requireActor("common");
  const attempt = await getCheckoutContext(user.id, z.uuid().parse(venueId), {
    checkoutId: z.uuid().parse(checkoutId),
  });
  if (attempt.checkoutId !== checkoutId || attempt.externalCustomerId !== user.id)
    throw new DomainError("NOT_FOUND");
  const context = await getVenueBillingContext(venueId);
  if ((context.state === "active" || context.state === "canceling") && context.isPublic)
    return "active";
  if (attempt.state === "failed" || attempt.state === "expired") return "failed";
  return "confirming";
}
