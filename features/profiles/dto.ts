import { z } from "zod";

const publicProfileRowSchema = z
  .object({
    handle: z.string(),
    display_name: z.string(),
    city_name: z.string(),
    bio: z.string().nullable(),
    member_since: z.string(),
    viewer_has_blocked: z.boolean(),
    friendship_id: z.uuid().nullable(),
    friendship_status: z.enum(["pending", "accepted"]).nullable(),
    friendship_direction: z.enum(["incoming", "outgoing", "accepted"]).nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    const values = [row.friendship_id, row.friendship_status, row.friendship_direction];
    if (values.some((value) => value === null) && values.some((value) => value !== null)) {
      context.addIssue({ code: "custom", message: "Friendship state must be complete." });
      return;
    }

    if (row.friendship_status === "accepted" && row.friendship_direction !== "accepted") {
      context.addIssue({ code: "custom", message: "Accepted friendship direction is invalid." });
    }
    if (
      row.friendship_status === "pending" &&
      !["incoming", "outgoing"].includes(row.friendship_direction ?? "")
    ) {
      context.addIssue({ code: "custom", message: "Pending friendship direction is invalid." });
    }
  });

export type PublicFriendshipDto = Readonly<{
  id: string;
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing" | "accepted";
}>;

export type PublicProfileDto = Readonly<{
  handle: string;
  displayName: string;
  cityName: string;
  bio: string | null;
  memberSince: string;
  viewerHasBlocked: boolean;
  friendship: PublicFriendshipDto | null;
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
    friendship:
      row.friendship_id === null ||
      row.friendship_status === null ||
      row.friendship_direction === null
        ? null
        : {
            id: row.friendship_id,
            status: row.friendship_status,
            direction: row.friendship_direction,
          },
  };
}
