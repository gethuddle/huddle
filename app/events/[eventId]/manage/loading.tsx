import { Skeleton } from "@/components/ui/skeleton";

export default function ManageEventLoading() {
  return (
    <section aria-label="Loading event management" className="space-y-6 py-16">
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-16 max-w-3xl" />
      <Skeleton className="h-[48rem]" />
    </section>
  );
}
