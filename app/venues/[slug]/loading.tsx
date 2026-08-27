import { Skeleton } from "@/components/ui/skeleton";

export default function VenueLoading() {
  return (
    <section aria-label="Loading venue" className="space-y-6 py-16">
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-16 max-w-3xl" />
      <Skeleton className="h-7 max-w-2xl" />
      <Skeleton className="h-64" />
    </section>
  );
}
