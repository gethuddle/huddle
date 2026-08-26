import { Skeleton } from "@/components/ui/skeleton";

export default function NewGroupLoading() {
  return (
    <section aria-busy="true" aria-label="Loading group creation" className="py-12 sm:py-16">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-5 h-14 w-full max-w-2xl" />
      <Skeleton className="mt-5 h-20 w-full max-w-2xl" />
      <div className="mt-12 max-w-3xl space-y-5">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </section>
  );
}
