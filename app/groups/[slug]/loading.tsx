import { Skeleton } from "@/components/ui/skeleton";

export default function GroupLoading() {
  return (
    <section aria-busy="true" aria-label="Loading group" className="py-12 sm:py-16">
      <Skeleton className="h-[26rem] w-full rounded-[2rem]" />
    </section>
  );
}
