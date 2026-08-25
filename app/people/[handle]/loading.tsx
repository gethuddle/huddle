export default function PublicProfileLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading community profile"
      className="mx-auto my-16 w-full max-w-4xl animate-pulse"
      role="status"
    >
      <div className="h-[30rem] rounded-[2rem] border border-border-dark bg-surface-raised" />
      <span className="sr-only">Loading community profile…</span>
    </section>
  );
}
