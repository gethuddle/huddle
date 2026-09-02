import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const projectRoot = new URL("../", import.meta.url);

// Supabase project references are public identifiers embedded in browser-safe URLs.
// Pinning them here prevents a valid target label/site URL from mutating the other
// hosted environment when an operator supplies the wrong project reference.
const reviewedProjectRefs = Object.freeze({
  preview: "igpobpkjxasvzcbfxorf",
  production: "koeqawpgxevfhuieqtcq",
});

function readTemplate(filename) {
  return readFileSync(new URL(`supabase/templates/${filename}`, projectRoot), "utf8");
}

export function buildAuthConfigPayload(siteUrl) {
  const normalized = new URL(siteUrl);
  if (normalized.protocol !== "https:" || normalized.href !== `${normalized.origin}/`) {
    throw new Error("The hosted Auth site URL must be one HTTPS origin.");
  }
  const origin = normalized.origin;

  return {
    site_url: origin,
    uri_allow_list: `${origin}/auth/verify/confirm,${origin}/auth/reset-password/confirm`,
    password_min_length: 15,
    password_required_characters: "",
    // Match the selected provider allowance so Supabase's default 30/hour cap is not tighter.
    // The shared SMTP-provider daily/monthly quotas still apply independently.
    rate_limit_email_sent: 100,
    // This Management API field is the 24-hour email-nonce reauthentication control.
    // Supabase's distinct current-password requirement is enabled and checked in Studio.
    security_update_password_require_reauthentication: true,
    mailer_notifications_password_changed_enabled: true,
    mailer_subjects_confirmation: "Confirm your Huddle account",
    mailer_subjects_recovery: "Reset your Huddle password",
    mailer_subjects_password_changed_notification: "Your Huddle password was changed",
    mailer_templates_confirmation_content: readTemplate("confirmation.html"),
    mailer_templates_recovery_content: readTemplate("recovery.html"),
    mailer_templates_password_changed_notification_content: readTemplate("password-changed.html"),
  };
}

export function resolveAuthConfigTarget(environment) {
  const target = environment.AUTH_CONFIG_TARGET?.trim();
  const configuredSiteUrl = environment.AUTH_CONFIG_SITE_URL?.trim();
  const projectRef = environment.SUPABASE_PROJECT_REF?.trim();
  if (!target || !configuredSiteUrl || !projectRef) {
    throw new Error(
      "AUTH_CONFIG_TARGET, AUTH_CONFIG_SITE_URL, and SUPABASE_PROJECT_REF are required.",
    );
  }
  if (target !== "preview" && target !== "production") {
    throw new Error("AUTH_CONFIG_TARGET must be preview or production.");
  }

  let normalized;
  try {
    normalized = new URL(configuredSiteUrl);
  } catch {
    throw new Error("AUTH_CONFIG_SITE_URL must be one HTTPS origin.");
  }
  if (normalized.protocol !== "https:" || normalized.href !== `${normalized.origin}/`) {
    throw new Error("AUTH_CONFIG_SITE_URL must be one HTTPS origin.");
  }

  if (target === "production" && normalized.origin !== "https://huddle.co.il") {
    throw new Error("Production Auth configuration requires https://huddle.co.il.");
  }
  if (target === "preview" && !normalized.hostname.endsWith(".vercel.app")) {
    throw new Error("Preview Auth configuration requires an HTTPS vercel.app origin.");
  }
  if (projectRef !== reviewedProjectRefs[target]) {
    throw new Error(
      `${target === "production" ? "Production" : "Preview"} Auth configuration requires the reviewed ${target} Supabase project.`,
    );
  }

  return { environment: target, projectRef, siteUrl: normalized.origin };
}

export function authConfigDrift(current, desired) {
  return Object.entries(desired)
    .filter(([key, value]) => current[key] !== value)
    .map(([key]) => key)
    .sort();
}

export function sanitizeConfigError(operation, status) {
  return `Supabase Auth configuration ${operation} failed (HTTP ${status}).`;
}

async function requestConfig(projectRef, accessToken, method, payload) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  if (!response.ok)
    throw new Error(sanitizeConfigError(method === "GET" ? "check" : "apply", response.status));
  return response.json();
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "--check" && mode !== "--apply") {
    throw new Error("Choose exactly one mode: --check or --apply.");
  }

  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required.");
  }

  const target = resolveAuthConfigTarget(process.env);
  const desired = buildAuthConfigPayload(target.siteUrl);
  const current = await requestConfig(target.projectRef, accessToken, "GET");
  let drift = authConfigDrift(current, desired);

  if (mode === "--apply" && drift.length > 0) {
    await requestConfig(target.projectRef, accessToken, "PATCH", desired);
    const verified = await requestConfig(target.projectRef, accessToken, "GET");
    drift = authConfigDrift(verified, desired);
  }

  if (drift.length > 0) {
    throw new Error(`Supabase Auth configuration drift: ${drift.join(", ")}.`);
  }

  process.stdout.write(
    `${target.environment === "production" ? "Production" : "Preview"} Supabase Auth configuration ${mode === "--apply" ? "applied and verified" : "matches"}.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Supabase Auth configuration failed."}\n`,
    );
    process.exitCode = 1;
  });
}
