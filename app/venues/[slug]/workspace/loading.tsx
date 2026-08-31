export default function VenueWorkspaceLoading() {
  return (
    <div aria-busy="true" aria-label="Loading Venue workspace" className="space-y-5 py-12">
      <div className="h-6 w-28 animate-pulse rounded-full bg-card" />
      <div className="h-12 w-full max-w-lg animate-pulse rounded-2xl bg-card" />
      <div className="h-48 w-full animate-pulse rounded-[1.375rem] bg-card" />
    </div>
  );
}
