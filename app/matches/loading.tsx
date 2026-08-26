import { Skeleton } from "@/components/ui/skeleton";

export default function MatchesLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading football fixtures"
      className="py-12"
      role="status"
    >
      <Skeleton className="h-4 w-32 bg-court/20" />
      <Skeleton className="mt-5 h-16 max-w-3xl" />
      <Skeleton className="mt-5 h-7 max-w-2xl" />
      <Skeleton className="mt-10 h-32 w-full rounded-2xl" />
      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className="h-80 rounded-2xl" key={index} />
        ))}
      </div>
      <span className="sr-only">Loading fixtures…</span>
    </section>
  );
}
