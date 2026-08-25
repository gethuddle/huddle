export default function ProfileSettingsLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading profile"
      className="mx-auto my-16 w-full max-w-4xl animate-pulse"
      role="status"
    >
      <div className="h-4 w-36 rounded bg-border-strong" />
      <div className="mt-5 h-12 w-3/4 rounded-xl bg-border-dark" />
      <div className="mt-4 h-6 w-full max-w-2xl rounded bg-border-dark" />
      <div className="mt-10 h-[36rem] rounded-[2rem] border border-border-dark bg-surface-raised" />
      <span className="sr-only">Loading profile…</span>
    </section>
  );
}
