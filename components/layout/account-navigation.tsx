import { UserRound } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function AccountNavigation() {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href="/account">
        <UserRound aria-hidden="true" />
        Account
      </Link>
    </Button>
  );
}
