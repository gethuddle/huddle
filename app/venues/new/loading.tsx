import { Skeleton } from "@/components/ui/skeleton";

export default function NewVenueLoading() {
  return (
    <section aria-label="Loading venue form" className="space-y-6 py-16">
      <Skeleton className="h-14 max-w-3xl" />
      <Skeleton className="h-7 max-w-2xl" />
      <Skeleton className="h-[42rem] max-w-3xl" />
    </section>
  );
}
