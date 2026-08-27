import "server-only";

import { DomainError } from "@/lib/errors";
import { createAnonymousServerClient } from "@/lib/supabase/anonymous";

export type VenueCatalog = Readonly<{
  cities: readonly Readonly<{ id: string; name: string }>[];
}>;

export async function getVenueCatalog(): Promise<VenueCatalog> {
  const supabase = createAnonymousServerClient();
  const { data, error } = await supabase
    .from("cities")
    .select("id, name_en")
    .eq("active", true)
    .order("name_en")
    .limit(100);

  if (error !== null) throw new DomainError("INTERNAL_ERROR", { cause: error });

  return {
    cities: data.map((city) => ({ id: city.id, name: city.name_en })),
  };
}
