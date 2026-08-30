import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileSettingsLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading profile"
      className="mx-auto my-16 w-full max-w-4xl"
      role="status"
    >
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-5 h-12 w-3/4" />
      <Skeleton className="mt-4 h-6 w-full max-w-2xl" />
      <Skeleton className="mt-10 h-[30rem] rounded-[1.375rem]" />
      <span className="sr-only">Loading profile…</span>
    </section>
  );
}
