import type { Metadata } from "next";
import Link from "next/link";

import { verificationStatusSchema } from "@/features/auth/schemas";

export const metadata: Metadata = {
  title: "Verify your email — Huddle",
};

type VerifyPageProps = Readonly<{
  searchParams: Promise<Readonly<{ status?: string | string[] }>>;
}>;

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const query = await searchParams;
  const parsedStatus = verificationStatusSchema.safeParse(query.status);
  const status = parsedStatus.success ? parsedStatus.data : "pending";

  if (status === "success") {
    return (
      <VerificationState
        actionHref="/settings/profile"
        actionLabel="Complete your profile"
        description="Your email is verified and your secure session is active. Complete your adult profile and accept the current community rules before using community actions."
        eyebrow="Email verified"
        title="You’re in."
      />
    );
  }

  if (status === "expired") {
    return (
      <VerificationState
        actionHref="/auth/sign-up"
        actionLabel="Create an account"
        description="This verification link is invalid, expired, or has already been used. Start the signup flow again to request a fresh link."
        eyebrow="Link unavailable"
        title="We couldn’t verify that link."
        tone="warning"
      />
    );
  }

  return (
    <VerificationState
      actionHref="/auth/sign-in"
      actionLabel="Go to sign in"
      description="We sent a verification link if the address can receive Huddle mail. Open that link in this browser to finish creating the session."
      eyebrow="Check your inbox"
      title="Verify your email."
    />
  );
}

type VerificationStateProps = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
  tone?: "default" | "warning";
}>;

function VerificationState({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
  tone = "default",
}: VerificationStateProps) {
  return (
    <section
      className="mx-auto my-16 w-full max-w-2xl rounded-[2rem] border border-border-dark bg-surface-raised p-8 text-center shadow-2xl shadow-black/20 sm:my-24 sm:p-12"
      role={tone === "warning" ? "alert" : undefined}
    >
      <p
        className={
          tone === "warning"
            ? "text-xs font-semibold uppercase tracking-[0.2em] text-sand"
            : "text-xs font-semibold uppercase tracking-[0.2em] text-court"
        }
      >
        {eyebrow}
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-linen">{title}</h1>
      <p className="mx-auto mt-4 max-w-xl leading-7 text-muted-dark">{description}</p>
      <Link
        className="mt-8 inline-flex rounded-xl bg-court px-6 py-3 text-sm font-semibold text-ink transition hover:bg-court-hover focus-visible:outline-2 focus-visible:outline-offset-2"
        href={actionHref}
      >
        {actionLabel}
      </Link>
    </section>
  );
}
