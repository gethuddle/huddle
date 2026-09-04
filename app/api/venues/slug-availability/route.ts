import { type NextRequest, NextResponse } from "next/server";

import { requireActor } from "@/features/auth/actor";
import { venueSlugSchema } from "@/features/venues/schemas";
import { z } from "zod";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const requestSchema = z.object({ venueId: z.uuid(), slug: venueSlugSchema }).strict();

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const parsed = requestSchema.safeParse({
    venueId: params.get("venueId"),
    slug: params.get("slug"),
  });
  if (
    !parsed.success ||
    [...params.keys()].length !== 2 ||
    params.getAll("venueId").length !== 1 ||
    params.getAll("slug").length !== 1
  ) {
    return NextResponse.json({ error: "Enter one valid venue URL." }, { status: 400, headers });
  }

  try {
    const { supabase } = await requireActor({ venueId: parsed.data.venueId });
    const { data, error } = await supabase.rpc("is_venue_slug_available", {
      input_slug: parsed.data.slug,
      input_venue_id: parsed.data.venueId,
    });
    if (error !== null || typeof data !== "boolean") throw new Error("Availability unavailable");
    return NextResponse.json({ available: data }, { headers });
  } catch {
    return NextResponse.json(
      { error: "Venue URL availability is temporarily unavailable." },
      { status: 503, headers },
    );
  }
}
