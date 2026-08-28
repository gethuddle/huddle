import { Skeleton } from "@/components/ui/skeleton";

export default function EventsDashboardLoading() {
  return (
    <section aria-label="Loading your events" className="space-y-6 py-16">
      <Skeleton className="h-16 max-w-3xl" />
      <Skeleton className="h-7 max-w-2xl" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </section>
  );
}
