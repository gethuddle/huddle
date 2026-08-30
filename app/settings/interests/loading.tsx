import { Skeleton } from "@/components/ui/skeleton";

export default function InterestSettingsLoading() {
  return (
    <section aria-busy="true" aria-label="Loading sports interests" className="py-12" role="status">
      <Skeleton className="h-4 w-32 bg-court/20" />
      <Skeleton className="mt-5 h-16 max-w-3xl" />
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className="h-28 rounded-[1.375rem]" key={index} />
        ))}
      </div>
      <span className="sr-only">Loading sports interests…</span>
    </section>
  );
}
