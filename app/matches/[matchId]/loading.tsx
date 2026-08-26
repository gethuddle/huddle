import { Skeleton } from "@/components/ui/skeleton";

export default function MatchDetailLoading() {
  return (
    <section aria-busy="true" aria-label="Loading match details" className="py-12" role="status">
      <Skeleton className="h-10 w-36" />
      <Skeleton className="mx-auto mt-8 h-[34rem] max-w-4xl rounded-[2rem]" />
      <span className="sr-only">Loading match details…</span>
    </section>
  );
}
