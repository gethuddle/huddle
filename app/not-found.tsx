import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      action={
        <Button asChild size="lg">
          <Link href="/">Return home</Link>
        </Button>
      }
      description="The page may have moved, may not exist, or may not be visible to you."
      title="Page not found"
    />
  );
}
