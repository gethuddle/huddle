import { z } from "zod";

import { MAX_COLLECTION_PAGE } from "@/lib/pagination";

const safeFixtureQuery = z
  .string()
  .trim()
  .max(80)
  .regex(/^[\p{L}\p{N}\s-]*$/u, "Use letters, numbers, spaces, or hyphens.");

const safeSportSlug = z
  .string()
  .trim()
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "Choose a valid sport.");

export const fixtureOptionSearchParamsSchema = z
  .object({
    q: safeFixtureQuery.optional().default(""),
    date: z
      .union([z.literal(""), z.iso.date()])
      .optional()
      .default(""),
    from: z
      .union([z.literal(""), z.iso.date()])
      .optional()
      .default(""),
    to: z
      .union([z.literal(""), z.iso.date()])
      .optional()
      .default(""),
    sport: z
      .union([z.literal(""), safeSportSlug])
      .optional()
      .default(""),
    competition: safeFixtureQuery.optional().default(""),
    page: z.coerce.number().int().min(1).max(MAX_COLLECTION_PAGE).optional().default(1),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.from === "") !== (value.to === "")) {
      context.addIssue({
        code: "custom",
        path: [value.from === "" ? "from" : "to"],
        message: "Choose both ends of the fixture range.",
      });
    }
    if (value.from !== "" && value.to !== "" && value.to < value.from) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "The fixture range must end after it starts.",
      });
    }
  });

export const fixtureOptionSchema = z
  .object({
    id: z.uuid(),
    label: z.string().min(1),
    startsAt: z.iso.datetime({ offset: true }),
    sportSlug: z.string().min(1).optional(),
    sportName: z.string().min(1).optional(),
    competitionName: z.string().min(1).optional(),
  })
  .strict();

export const fixtureOptionPageSchema = z
  .object({
    items: z.array(fixtureOptionSchema).max(50),
    page: z.number().int().min(1).max(MAX_COLLECTION_PAGE),
    hasMore: z.boolean(),
  })
  .strict();

export type FixtureOption = z.infer<typeof fixtureOptionSchema>;
export type FixtureOptionSearchParams = z.infer<typeof fixtureOptionSearchParamsSchema>;
export type FixtureOptionPage = z.infer<typeof fixtureOptionPageSchema>;
