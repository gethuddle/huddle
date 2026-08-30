import type { DomainErrorCode } from "@/lib/errors";

export type FanRecovery = Readonly<{
  actionHref: string;
  actionLabel: string;
  description: string;
  eyebrow: string;
  title: string;
  warning?: boolean;
}>;

export function fanRecovery(code: DomainErrorCode): FanRecovery {
  if (code === "EMAIL_NOT_VERIFIED") {
    return {
      actionHref: "/auth/verify",
      actionLabel: "Review verification",
      description: "Verify your email before opening Fan community features.",
      eyebrow: "Verification required",
      title: "Verify your email to continue.",
    };
  }

  if (code === "PROFILE_INCOMPLETE") {
    return {
      actionHref: "/onboarding/fan",
      actionLabel: "Enable Fan workspace",
      description:
        "Complete Fan setup directly. Venue-only accounts can add a Fan workspace without leaving their Venue workspace behind.",
      eyebrow: "Fan setup required",
      title: "Enable your Fan workspace to continue.",
    };
  }

  if (code === "ADULT_ATTESTATION_REQUIRED" || code === "RULES_ACCEPTANCE_REQUIRED") {
    return {
      actionHref: "/onboarding",
      actionLabel: "Continue setup",
      description:
        "Complete the current eligibility steps or enable a Fan workspace if you currently use Huddle only as a Venue.",
      eyebrow: "Fan setup required",
      title: "Finish Fan setup to continue.",
    };
  }

  return {
    actionHref: "/account",
    actionLabel: "Open account",
    description:
      "Community access is currently limited. Account and Safety remain available for recovery and appeals.",
    eyebrow: "Community access limited",
    title: "Review your account status.",
    warning: true,
  };
}
