import { z } from "zod";

const publicProfileRowSchema = z
  .object({
    handle: z.string(),
    display_name: z.string(),
    city_name: z.string(),
    bio: z.string().nullable(),
    member_since: z.string(),
    viewer_has_blocked: z.boolean(),
  })
  .strict();

export type PublicProfileDto = Readonly<{
  handle: string;
  displayName: string;
  cityName: string;
  bio: string | null;
  memberSince: string;
  viewerHasBlocked: boolean;
}>;

export function toPublicProfileDto(input: unknown): PublicProfileDto {
  const row = publicProfileRowSchema.parse(input);

  return {
    handle: row.handle,
    displayName: row.display_name,
    cityName: row.city_name,
    bio: row.bio,
    memberSince: row.member_since,
    viewerHasBlocked: row.viewer_has_blocked,
  };
}
