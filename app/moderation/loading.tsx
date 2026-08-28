import { Skeleton } from "@/components/ui/skeleton";

export default function ModerationLoading() {
  return (
    <section aria-busy="true" aria-label="Loading moderation queue" className="py-12 sm:py-16">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-5 h-16 w-full max-w-2xl" />
      <Skeleton className="mt-10 h-56 w-full" />
      <Skeleton className="mt-5 h-56 w-full" />
    </section>
  );
}
