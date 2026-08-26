import { z } from "zod";

const optionalUuidSchema = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  z.uuid().nullable(),
);

export const groupSlugSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(
    z
      .string()
      .min(3, "Use at least 3 characters.")
      .max(60, "Use 60 characters or fewer.")
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens."),
  );

export const groupCreationSchema = z.object({
  intent: z.enum(["check", "create"]),
  name: z.string().trim().min(3, "Use at least 3 characters.").max(80),
  slug: groupSlugSchema,
  cityId: z.uuid(),
  teamId: optionalUuidSchema,
  visibility: z.enum(["discoverable", "unlisted"]),
  description: z.string().trim().max(2000, "Use 2,000 characters or fewer."),
});

export const groupRouteSlugSchema = groupSlugSchema;

export type GroupCreationInput = z.infer<typeof groupCreationSchema>;
