import { z } from "zod";

const nonEmptyEnvironmentValue = z.string().trim().min(1);
const httpUrl = z
  .url()
  .refine(
    (value) => value.startsWith("http://") || value.startsWith("https://"),
    "Must be an HTTP(S) URL",
  );
const deploymentEnvironment = z.enum(["local", "preview", "production"]);
const vercelEnvironment = z.enum(["development", "preview", "production"]);
const environmentBoolean = z
  .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
  .default(false);

export const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: nonEmptyEnvironmentValue,
  NEXT_PUBLIC_APP_URL: httpUrl,
});

export const serverEnvironmentSchema = publicEnvironmentSchema
  .extend({
    HUDDLE_ENVIRONMENT: deploymentEnvironment,
    SUPABASE_SERVICE_ROLE_KEY: nonEmptyEnvironmentValue,
    FOOTBALL_DATA_API_TOKEN: nonEmptyEnvironmentValue,
    SPORTS_SYNC_SECRET: z.string().trim().min(32),
    DISCOVERY_CURSOR_SECRET: z.string().trim().min(32),
    ASSISTED_DISCOVERY_ENABLED: environmentBoolean,
    ASSISTED_DISCOVERY_TOKEN_SECRET: z.string().trim().min(32).optional(),
    CLOUDFLARE_ACCOUNT_ID: nonEmptyEnvironmentValue.optional(),
    CLOUDFLARE_WORKERS_AI_API_TOKEN: nonEmptyEnvironmentValue.optional(),
    VERCEL_ENV: vercelEnvironment.optional(),
  })
  .superRefine((environment, context) => {
    const expectedEnvironment =
      environment.VERCEL_ENV === "development" ? "local" : environment.VERCEL_ENV;

    if (
      expectedEnvironment !== undefined &&
      expectedEnvironment !== environment.HUDDLE_ENVIRONMENT
    ) {
      context.addIssue({
        code: "custom",
        message: "Must match the active Vercel environment",
        path: ["HUDDLE_ENVIRONMENT"],
      });
    }

    if (environment.HUDDLE_ENVIRONMENT !== "local") {
      for (const variable of ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const) {
        if (!environment[variable].startsWith("https://")) {
          context.addIssue({
            code: "custom",
            message: "Hosted environments require HTTPS",
            path: [variable],
          });
        }
      }
    }

    if (environment.ASSISTED_DISCOVERY_ENABLED) {
      for (const variable of [
        "ASSISTED_DISCOVERY_TOKEN_SECRET",
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_WORKERS_AI_API_TOKEN",
      ] as const) {
        if (environment[variable] === undefined) {
          context.addIssue({
            code: "custom",
            message: "Required when assisted discovery is enabled",
            path: [variable],
          });
        }
      }
    }
  });

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;
export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export class EnvironmentConfigurationError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    const sortedVariables = [...new Set(variables)].sort();

    super(`Invalid environment variables: ${sortedVariables.join(", ")}`);
    this.name = "EnvironmentConfigurationError";
    this.variables = sortedVariables;
  }
}

function parseEnvironment<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);

  if (result.success) {
    return result.data;
  }

  const variables = result.error.issues.map((issue) => String(issue.path[0] ?? "environment"));
  throw new EnvironmentConfigurationError(variables);
}

export function parsePublicEnvironment(input: unknown): PublicEnvironment {
  return parseEnvironment(publicEnvironmentSchema, input);
}

export function parseServerEnvironment(input: unknown): ServerEnvironment {
  return parseEnvironment(serverEnvironmentSchema, input);
}
