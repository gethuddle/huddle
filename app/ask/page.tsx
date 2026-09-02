import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireActor } from "@/features/auth/actor";
import { fanRecovery } from "@/features/auth/fan-recovery";
import { AssistedDiscoveryChat } from "@/features/assisted-discovery/components/assisted-discovery-chat";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { getServerEnvironment } from "@/lib/env/server";
import { DomainError } from "@/lib/errors";

export const metadata: Metadata = {
  title: "Ask Huddle — Huddle",
  description: "Describe the watch event you want and find up to three eligible huddles.",
};

export default async function AskPage() {
  if (!getServerEnvironment().ASSISTED_DISCOVERY_ENABLED) notFound();

  try {
    await requireActor("fan");
  } catch (error) {
    if (error instanceof DomainError && error.code === "AUTH_REQUIRED") {
      return (
        <ProfileAccessState
          actionHref="/auth/sign-in"
          actionLabel="Sign in"
          description="Ask Huddle searches only the events your Fan account is allowed to see."
          eyebrow="Sign in required"
          title="Sign in to ask Huddle."
        />
      );
    }
    if (error instanceof DomainError && error.code !== "INTERNAL_ERROR") {
      return <ProfileAccessState {...fanRecovery(error.code)} />;
    }
    throw error;
  }

  return (
    <div className="flex h-[calc(100dvh-9.75rem)] min-h-[30rem] flex-col py-4 sm:py-6 lg:h-[calc(100dvh-10rem)] lg:max-h-[48rem] lg:min-h-[36rem] lg:py-8">
      <div className="lg:mb-4">
        <p className="hidden text-sm font-medium text-forest lg:block">Assisted discovery</p>
        <h1 className="sr-only mt-1 text-3xl font-semibold tracking-[-0.04em] text-foreground lg:not-sr-only">
          Ask Huddle
        </h1>
        <p className="mt-2 hidden text-sm text-muted-foreground lg:block">
          One question, up to three exact matches. Every question starts fresh.
        </p>
      </div>
      <div className="flex min-h-0 flex-1">
        <AssistedDiscoveryChat />
      </div>
    </div>
  );
}
