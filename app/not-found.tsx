import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";

export default function NotFound() {
  return (
    <EmptyState
      action={
        <Link
          className="inline-flex rounded-xl bg-court px-6 py-3 text-sm font-semibold text-ink transition hover:bg-court-hover focus-visible:outline-2 focus-visible:outline-offset-2"
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
