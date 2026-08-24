import type { ReactNode } from "react";

type EmptyStateProps = Readonly<{
  title: string;
  description: string;
  action?: ReactNode;
}>;

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <section
      aria-labelledby="empty-state-title"
      className="mx-auto my-16 w-full max-w-2xl rounded-[2rem] border border-dashed border-border-strong bg-surface-raised p-8 text-center sm:p-12"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court">
        Nothing here yet
      </p>
      <h1
        className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-linen"
        id="empty-state-title"
      >
        {title}
      </h1>
      <p className="mx-auto mt-4 max-w-xl leading-7 text-muted-dark">{description}</p>
      {action === undefined ? null : <div className="mt-7">{action}</div>}
    </section>
  );
}
