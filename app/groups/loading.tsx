import { Skeleton } from "@/components/ui/skeleton";

export default function GroupsLoading() {
  return (
    <section aria-busy="true" aria-label="Loading groups" className="py-12 sm:py-16">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-5 h-16 max-w-3xl" />
      <Skeleton className="mt-8 h-28 w-full rounded-2xl" />
      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className="h-72 rounded-2xl" key={index} />
        ))}
      </div>
    </section>
  );
}
