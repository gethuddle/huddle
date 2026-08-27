import { Skeleton } from "@/components/ui/skeleton";

export default function NewEventLoading() {
  return (
    <section aria-label="Loading event form" className="space-y-6 py-16">
      <Skeleton className="h-16 max-w-3xl" />
      <Skeleton className="h-7 max-w-2xl" />
      <Skeleton className="h-[52rem] max-w-4xl" />
    </section>
  );
}
