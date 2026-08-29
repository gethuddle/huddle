import { Skeleton } from "@/components/ui/skeleton";

export default function PeopleLoading() {
  return (
    <section aria-busy="true" aria-label="Loading people search" className="py-12 sm:py-16">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-5 h-16 max-w-2xl" />
      <Skeleton className="mt-8 h-28 w-full rounded-2xl" />
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
    </section>
  );
}
