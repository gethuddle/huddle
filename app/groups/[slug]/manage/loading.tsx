import { Skeleton } from "@/components/ui/skeleton";

export default function GroupManagementLoading() {
  return (
    <section aria-busy="true" aria-label="Loading group administration" className="py-12 sm:py-16">
      <Skeleton className="h-36 w-3/4 rounded-2xl" />
      <Skeleton className="mt-10 h-14 w-full rounded-2xl" />
      <Skeleton className="mt-8 h-80 w-full rounded-[2rem]" />
    </section>
  );
}
