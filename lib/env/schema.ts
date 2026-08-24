import { z } from "zod";

const nonEmptyEnvironmentValue = z.string().trim().min(1);
const httpUrl = z
  .url()
  .refine(
    (value) => value.startsWith("http://") || value.startsWith("https://"),
    "Must be an HTTP(S) URL",
  );

export const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: nonEmptyEnvironmentValue,
  NEXT_PUBLIC_APP_URL: httpUrl,
});

export const serverEnvironmentSchema = publicEnvironmentSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: nonEmptyEnvironmentValue,
  FOOTBALL_DATA_API_TOKEN: nonEmptyEnvironmentValue,
  SPORTS_SYNC_SECRET: nonEmptyEnvironmentValue,
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
