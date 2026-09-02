import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  authConfigDrift,
  buildAuthConfigPayload,
  resolveAuthConfigTarget,
  sanitizeConfigError,
} from "./supabase-auth-config.mjs";

const productionProjectRef = "koeqawpgxevfhuieqtcq";
const previewProjectRef = "igpobpkjxasvzcbfxorf";

function template(filename: string) {
  return readFileSync(new URL(`../supabase/templates/${filename}`, import.meta.url), "utf8");
}

describe("hosted Supabase Auth configuration", () => {
  it("builds exact replacement templates and automatable production settings", () => {
    const payload = buildAuthConfigPayload("https://huddle.co.il");

    expect(payload).toMatchObject({
      site_url: "https://huddle.co.il",
      uri_allow_list:
        "https://huddle.co.il/auth/verify/confirm,https://huddle.co.il/auth/reset-password/confirm",
      password_min_length: 15,
      password_required_characters: "",
      rate_limit_email_sent: 100,
      security_update_password_require_reauthentication: true,
      mailer_notifications_password_changed_enabled: true,
      mailer_subjects_confirmation: "Confirm your Huddle account",
      mailer_subjects_recovery: "Reset your Huddle password",
      mailer_subjects_password_changed_notification: "Your Huddle password was changed",
    });
    expect(payload.mailer_templates_confirmation_content).toBe(template("confirmation.html"));
    expect(payload.mailer_templates_recovery_content).toBe(template("recovery.html"));
    expect(payload.mailer_templates_password_changed_notification_content).toBe(
      template("password-changed.html"),
    );
  });

  it("reports field names only and never template bodies", () => {
    const desired = buildAuthConfigPayload("https://huddle.co.il");
    const current = {
      ...desired,
      password_min_length: 8,
      mailer_templates_recovery_content: "old",
    };

    expect(authConfigDrift(current, desired)).toEqual([
      "mailer_templates_recovery_content",
      "password_min_length",
    ]);
  });

  it("sanitizes provider errors to status and operation only", () => {
    const output = sanitizeConfigError("check", 401);

    expect(output).toBe("Supabase Auth configuration check failed (HTTP 401).");
    expect(output).not.toContain("secret");
  });

  it("requires an explicit environment-matched hosted Auth target", () => {
    expect(
      resolveAuthConfigTarget({
        AUTH_CONFIG_TARGET: "production",
        AUTH_CONFIG_SITE_URL: "https://huddle.co.il",
        SUPABASE_PROJECT_REF: productionProjectRef,
      }),
    ).toEqual({
      environment: "production",
      projectRef: productionProjectRef,
      siteUrl: "https://huddle.co.il",
    });
    expect(
      resolveAuthConfigTarget({
        AUTH_CONFIG_TARGET: "preview",
        AUTH_CONFIG_SITE_URL: "https://huddle-git-auth.example.vercel.app",
        SUPABASE_PROJECT_REF: previewProjectRef,
      }),
    ).toEqual({
      environment: "preview",
      projectRef: previewProjectRef,
      siteUrl: "https://huddle-git-auth.example.vercel.app",
    });
  });

  it.each([
    [{}, "AUTH_CONFIG_TARGET, AUTH_CONFIG_SITE_URL, and SUPABASE_PROJECT_REF are required."],
    [
      {
        AUTH_CONFIG_TARGET: "preview",
        AUTH_CONFIG_SITE_URL: "https://huddle.co.il",
        SUPABASE_PROJECT_REF: previewProjectRef,
      },
      "Preview Auth configuration requires an HTTPS vercel.app origin.",
    ],
    [
      {
        AUTH_CONFIG_TARGET: "production",
        AUTH_CONFIG_SITE_URL: "https://preview.example.vercel.app",
        SUPABASE_PROJECT_REF: productionProjectRef,
      },
      "Production Auth configuration requires https://huddle.co.il.",
    ],
    [
      {
        AUTH_CONFIG_TARGET: "production",
        AUTH_CONFIG_SITE_URL: "https://huddle.co.il",
        SUPABASE_PROJECT_REF: previewProjectRef,
      },
      "Production Auth configuration requires the reviewed production Supabase project.",
    ],
    [
      {
        AUTH_CONFIG_TARGET: "preview",
        AUTH_CONFIG_SITE_URL: "https://preview.example.vercel.app",
        SUPABASE_PROJECT_REF: productionProjectRef,
      },
      "Preview Auth configuration requires the reviewed preview Supabase project.",
    ],
  ])("rejects an unsafe hosted Auth target", (environment, message) => {
    expect(() => resolveAuthConfigTarget(environment)).toThrow(message);
  });
});
