type BuildEnvironmentInput = Readonly<Record<string, string | undefined>>;

const vercelPreviewHostname =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel\.app$/;

export function resolveBuildApplicationUrl(input: BuildEnvironmentInput): string | undefined {
  const configuredUrl = input.NEXT_PUBLIC_APP_URL?.trim();
  const previewHostname = input.VERCEL_BRANCH_URL?.trim() || input.VERCEL_URL?.trim();

  if (input.VERCEL_ENV === "preview" && previewHostname) {
    return vercelPreviewHostname.test(previewHostname) ? `https://${previewHostname}` : undefined;
  }

  return configuredUrl || undefined;
}
