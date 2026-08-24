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
      className="mx-auto my-16 w-full max-w-2xl rounded-[2rem] border border-[#9b4d38]/25 bg-[#fff9f4]/80 p-8 text-center shadow-[0_20px_70px_rgba(67,35,27,0.08)] sm:p-12"
      role="alert"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b4735]">
        Unable to continue
      </p>
      <h1
        className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#31221e]"
        id="error-state-title"
      >
        {title}
      </h1>
      <p className="mx-auto mt-4 max-w-xl leading-7 text-[#69534c]">{description}</p>
      {reference === undefined ? null : (
        <p className="mt-4 text-xs text-[#7b665f]">Reference: {reference}</p>
      )}
      {onRetry === undefined ? null : (
        <button
          className="mt-7 rounded-full bg-[#173f2a] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#22563a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173f2a]"
          onClick={onRetry}
          type="button"
        >
          Try again
        </button>
      )}
    </section>
  );
}
