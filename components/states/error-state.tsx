"use client";

type ErrorStateProps = Readonly<{
  title: string;
  description: string;
  onRetry?: () => void;
  reference?: string;
}>;

export function ErrorState({ title, description, onRetry, reference }: ErrorStateProps) {
  return (
    <section
      aria-labelledby="error-state-title"
      className="mx-auto my-16 w-full max-w-2xl rounded-[2rem] border border-sand/30 bg-surface-raised p-8 text-center shadow-2xl shadow-black/20 sm:p-12"
      role="alert"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sand">
        Unable to continue
      </p>
      <h1
        className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-linen"
        id="error-state-title"
      >
        {title}
      </h1>
      <p className="mx-auto mt-4 max-w-xl leading-7 text-muted-dark">{description}</p>
      {reference === undefined ? null : (
        <p className="mt-4 text-xs text-muted-dark">Reference: {reference}</p>
      )}
      {onRetry === undefined ? null : (
        <button
          className="mt-7 rounded-xl bg-court px-6 py-3 text-sm font-semibold text-ink transition hover:bg-court-hover focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={onRetry}
          type="button"
        >
          Try again
        </button>
      )}
    </section>
  );
}
