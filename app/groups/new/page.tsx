import type { Metadata } from "next";

import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { getGroupCreationCatalog } from "@/features/groups/catalog";
import { GroupCreateForm } from "@/features/groups/components/group-create-form";
import { getGroupCreationViewerState } from "@/features/groups/viewer";

export const metadata: Metadata = {
  title: "Create a supporter group — Huddle",
};

export default async function NewGroupPage() {
  const viewerState = await getGroupCreationViewerState();

  if (viewerState === "anonymous") {
    return (
      <ProfileAccessState
        actionHref="/auth/sign-in"
        actionLabel="Sign in"
        description="Group ownership belongs to a verified Huddle account."
        eyebrow="Sign in required"
        title="Sign in to create a group."
      />
    );
  }
  if (viewerState === "complete-profile") {
    return (
      <ProfileAccessState
        actionHref="/settings/profile"
        actionLabel="Complete profile"
        description="Verify your email, confirm you are 18+, accept the current rules, and finish your profile first."
        eyebrow="Profile required"
        title="Finish joining before creating a group."
      />
    );
  }
  if (viewerState === "not-permitted") {
    return (
      <ProfileAccessState
        description="This account cannot create community groups."
        eyebrow="Not permitted"
        title="Group creation is unavailable."
        warning
      />
    );
  }

  const catalog = await getGroupCreationCatalog();

  return (
    <section className="py-12 sm:py-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.75fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">
            Build your huddle
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
            Create a supporter group.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-dark">
            Check for similar discoverable groups, choose a clear visibility boundary, and become
            the group’s active owner in one atomic step.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface-deep p-6">
          <p className="font-semibold text-linen">What happens now</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-dark">
            <li>One group and exactly one active owner membership.</li>
            <li>A discoverable group starts forming; an unlisted group works immediately.</li>
            <li>This step does not invite anyone or publish a discoverable group.</li>
          </ul>
        </div>
      </div>

      <div className="mt-12 max-w-3xl">
        <GroupCreateForm catalog={catalog} />
      </div>
    </section>
  );
}
