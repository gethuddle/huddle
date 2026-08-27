import { Skeleton } from "@/components/ui/skeleton";

export default function EventLoading() {
  return (
    <section aria-label="Loading event" className="space-y-6 py-16">
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-16 max-w-3xl" />
      <Skeleton className="h-[32rem]" />
    </section>
  );
}
