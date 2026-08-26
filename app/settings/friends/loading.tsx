import { Skeleton } from "@/components/ui/skeleton";

export default function FriendsSettingsLoading() {
  return (
    <section aria-busy="true" aria-label="Loading friendship settings" className="py-12 sm:py-16">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-5 h-14 w-full max-w-xl" />
      <Skeleton className="mt-5 h-20 w-full max-w-2xl" />
      <div className="mt-10 flex gap-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
      <Skeleton className="mt-8 h-28 w-full" />
    </section>
  );
}
