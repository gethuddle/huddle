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

  if (status === "expired") {
    return (
      <VerificationState
        actionHref="/auth/sign-up"
        actionLabel="Request another email"
        description="This verification link is invalid, expired, or has already been used. Request a fresh email or sign in if this address is already verified."
        eyebrow="Link unavailable"
        secondaryActionHref="/auth/sign-in"
        secondaryActionLabel="Sign in"
        title="We couldn’t verify that link."
        tone="warning"
      />
    );
  }

  return (
    <VerificationState
      actionHref="/auth/sign-in"
      actionLabel="Go to sign in"
      description="If that address can receive Huddle mail, a verification link is on its way. Open it in this browser to finish creating the session."
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
  secondaryActionHref?: string;
  secondaryActionLabel?: string;
}>;

function VerificationState({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
  tone = "default",
  secondaryActionHref,
  secondaryActionLabel,
}: VerificationStateProps) {
  return (
    <section
      className="mx-auto my-16 w-full max-w-2xl rounded-[2rem] border border-border bg-card p-8 text-center shadow-none sm:my-24 sm:p-12"
      role={tone === "warning" ? "alert" : undefined}
    >
      <p
        className={
          tone === "warning" ? "text-sm font-medium text-sand" : "text-sm font-medium text-forest"
        }
      >
        {eyebrow}
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-foreground">{title}</h1>
      <p
        aria-live={tone === "warning" ? undefined : "polite"}
        className="mx-auto mt-4 max-w-xl leading-7 text-muted-foreground"
        role={tone === "warning" ? undefined : "status"}
      >
        {description}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          className="inline-flex rounded-xl bg-court px-6 py-3 text-sm font-semibold text-ink transition hover:bg-court-hover focus-visible:outline-2 focus-visible:outline-offset-2"
          href={actionHref}
        >
          {actionLabel}
        </Link>
        {secondaryActionHref === undefined || secondaryActionLabel === undefined ? null : (
          <Link
            className="inline-flex rounded-xl border border-border px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"
            href={secondaryActionHref}
          >
            {secondaryActionLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
