import { Skeleton } from "@/components/ui/skeleton";

export default function DiscoveryLoading() {
  return (
    <section aria-busy="true" aria-label="Loading event discovery" className="py-12 sm:py-16">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-5 h-20 max-w-4xl" />
      <Skeleton className="mt-8 h-40 w-full rounded-2xl" />
      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className="h-96 rounded-2xl" key={index} />
        ))}
      </div>
    </section>
  );
}
