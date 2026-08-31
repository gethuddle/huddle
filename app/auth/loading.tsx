export default function AuthLoading() {
  return (
    <section
      aria-label="Loading account page"
      aria-live="polite"
      className="mx-auto my-20 w-full max-w-xl animate-pulse rounded-[2rem] border border-border bg-card p-10"
      role="status"
    >
      <div className="h-3 w-28 rounded bg-court/30" />
      <div className="mt-5 h-10 w-3/4 rounded bg-border-strong" />
      <div className="mt-5 h-5 w-full rounded bg-border-dark" />
      <div className="mt-10 h-12 w-full rounded-xl bg-border-strong" />
      <span className="sr-only">Loading…</span>
    </section>
  );
}
