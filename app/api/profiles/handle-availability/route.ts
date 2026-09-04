import { type NextRequest, NextResponse } from "next/server";
import { profileHandleSchema } from "@/features/profiles/schemas";
import { createClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const parsed = profileHandleSchema.safeParse(params.get("handle"));
  if (!parsed.success || [...params.keys()].length !== 1) {
    return NextResponse.json({ error: "Enter one valid username." }, { status: 400, headers });
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("is_profile_handle_available", {
      input_handle: parsed.data,
    });
    if (error !== null || typeof data !== "boolean") throw new Error("Availability unavailable");
    return NextResponse.json({ available: data }, { headers });
  } catch {
    return NextResponse.json(
      { error: "Username availability is temporarily unavailable." },
      { status: 503, headers },
    );
  }
}
