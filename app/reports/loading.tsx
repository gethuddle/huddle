import { Skeleton } from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <section aria-busy="true" aria-label="Loading safety center" className="py-12 sm:py-16">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-5 h-16 w-full max-w-2xl" />
      <Skeleton className="mt-5 h-20 w-full max-w-3xl" />
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </section>
  );
}
