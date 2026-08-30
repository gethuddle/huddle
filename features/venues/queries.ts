import "server-only";

import { z } from "zod";

import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const verificationStatusSchema = z.enum(["unverified", "verified", "suspended"]);

const publicVenueRowSchema = z
  .object({
    venue_id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    city_id: z.uuid(),
    city_name: z.string(),
    address_text: z.string(),
    description: z.string(),
    screen_count: z.number().int().positive().nullable(),
    stated_capacity: z.number().int().positive().nullable(),
    verification_status: verificationStatusSchema,
    owner_handle: z.string().nullable(),
    follower_count: z.number().int().nonnegative(),
    viewer_follows: z.boolean(),
    viewer_is_owner: z.boolean(),
  })
  .strict();

const managedVenueRowSchema = z
  .object({
    venue_id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    city_id: z.uuid(),
    city_name: z.string(),
    address_text: z.string(),
    longitude: z.number(),
    latitude: z.number(),
    description: z.string(),
    screen_count: z.number().int().positive().nullable(),
    stated_capacity: z.number().int().positive().nullable(),
    verification_status: verificationStatusSchema,
    suspended_at: z.string().nullable(),
  })
  .strict();

export type PublicVenue = Readonly<{
  id: string;
  slug: string;
  name: string;
  cityId: string;
  cityName: string;
  addressText: string;
  description: string;
  screenCount: number | null;
  statedCapacity: number | null;
  verificationStatus: z.infer<typeof verificationStatusSchema>;
  ownerHandle: string | null;
  followerCount: number;
  viewerFollows: boolean;
  viewerIsOwner: boolean;
}>;

export type ManagedVenue = Readonly<{
  id: string;
  slug: string;
  name: string;
  cityId: string;
  cityName: string;
  addressText: string;
  longitude: number;
  latitude: number;
  description: string;
  screenCount: number | null;
  statedCapacity: number | null;
  verificationStatus: z.infer<typeof verificationStatusSchema>;
  suspendedAt: string | null;
}>;

export async function getVenueBySlug(slug: string): Promise<PublicVenue | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_venue_by_slug", { lookup_slug: slug });
  if (error !== null) throw domainErrorFromDatabase(error);

  const raw = data.at(0);
  if (raw === undefined) return null;

  try {
    const row = publicVenueRowSchema.parse(raw);
    return {
      id: row.venue_id,
      slug: row.slug,
      name: row.name,
      cityId: row.city_id,
      cityName: row.city_name,
      addressText: row.address_text,
      description: row.description,
      screenCount: row.screen_count,
      statedCapacity: row.stated_capacity,
      verificationStatus: row.verification_status,
      ownerHandle: row.owner_handle,
      followerCount: row.follower_count,
      viewerFollows: row.viewer_follows,
      viewerIsOwner: row.viewer_is_owner,
    };
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

export async function getVenueForManagement(slug: string): Promise<ManagedVenue | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_venue_for_management", {
    lookup_slug: slug,
  });
  if (error !== null) {
    if (error.message === "AUTH_REQUIRED") throw new DomainError("AUTH_REQUIRED", { cause: error });
    if (
      error.message === "PROFILE_INCOMPLETE" ||
      error.message === "EMAIL_NOT_VERIFIED" ||
      error.message === "ADULT_ATTESTATION_REQUIRED" ||
      error.message === "RULES_ACCEPTANCE_REQUIRED"
    ) {
      throw new DomainError("PROFILE_INCOMPLETE", { cause: error });
    }
    throw domainErrorFromDatabase(error);
  }

  const raw = data.at(0);
  if (raw === undefined) return null;

  try {
    const row = managedVenueRowSchema.parse(raw);
    return {
      id: row.venue_id,
      slug: row.slug,
      name: row.name,
      cityId: row.city_id,
      cityName: row.city_name,
      addressText: row.address_text,
      longitude: row.longitude,
      latitude: row.latitude,
      description: row.description,
      screenCount: row.screen_count,
      statedCapacity: row.stated_capacity,
      verificationStatus: row.verification_status,
      suspendedAt: row.suspended_at,
    };
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

export { getVenueWorkspace, listVenueCalendar } from "@/features/venues/workspace/queries";
