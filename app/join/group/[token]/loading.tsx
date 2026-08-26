import { Skeleton } from "@/components/ui/skeleton";

export default function GroupInviteLoading() {
  return (
    <section aria-busy="true" aria-label="Loading group invitation" className="py-12 sm:py-20">
      <Skeleton className="mx-auto h-[30rem] max-w-3xl rounded-[2rem]" />
    </section>
  );
}
