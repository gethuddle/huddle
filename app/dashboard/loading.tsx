import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <section aria-busy="true" aria-label="Loading My Huddle" className="py-12 sm:py-16">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-5 h-16 max-w-3xl" />
      <Skeleton className="mt-5 h-8 max-w-2xl" />
      <div className="mt-12 grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </section>
  );
}
