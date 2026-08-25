import Link from "next/link";

type ProfileAccessStateProps = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  warning?: boolean;
}>;

export function ProfileAccessState({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
  warning = false,
}: ProfileAccessStateProps) {
  return (
    <section
      className="mx-auto my-16 w-full max-w-2xl rounded-[2rem] border border-border-dark bg-surface-raised p-8 text-center shadow-2xl shadow-black/20 sm:my-24 sm:p-12"
      role={warning ? "alert" : undefined}
    >
      <p
        className={
          warning
            ? "text-xs font-semibold uppercase tracking-[0.2em] text-sand"
            : "text-xs font-semibold uppercase tracking-[0.2em] text-court"
        }
      >
        {eyebrow}
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-linen">{title}</h1>
      <p className="mx-auto mt-4 max-w-xl leading-7 text-muted-dark">{description}</p>
      {actionHref === undefined || actionLabel === undefined ? null : (
        <Link
          className="mt-8 inline-flex rounded-xl bg-court px-6 py-3 text-sm font-semibold text-ink transition hover:bg-court-hover focus-visible:outline-2 focus-visible:outline-offset-2"
          href={actionHref}
        >
          {actionLabel}
        </Link>
      )}
    </section>
  );
}
