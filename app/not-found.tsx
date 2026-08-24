import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";

export default function NotFound() {
  return (
    <EmptyState
      action={
        <Link
          className="inline-flex rounded-full bg-[#173f2a] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#22563a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173f2a]"
          href="/"
        >
          Return home
        </Link>
      }
      description="The page may have moved, may not exist, or may not be visible to you."
      title="Page not found"
    />
  );
}
