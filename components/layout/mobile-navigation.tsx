"use client";

import { Menu } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const publicLinks = [
  ["Home", "/"],
  ["Fixtures", "/matches"],
  ["Discover", "/discover"],
  ["Groups", "/groups"],
] as const;

const signedInLinks = [
  ["Interests", "/settings/interests"],
  ["Friends", "/settings/friends"],
  ["My events", "/events"],
  ["Safety", "/reports"],
  ["Create group", "/groups/new"],
  ["Create venue", "/venues/new"],
  ["Host event", "/events/new"],
  ["Profile", "/settings/profile"],
] as const;

export function MobileNavigation({
  isModerator,
  isSignedIn,
}: Readonly<{ isModerator: boolean; isSignedIn: boolean }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="xl:hidden" size="sm" variant="ghost">
          <Menu aria-hidden="true" />
          Menu
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label="Mobile navigation">
        <DropdownMenuLabel>Navigate</DropdownMenuLabel>
        {publicLinks.map(([label, href]) => (
          <DropdownMenuItem asChild key={href}>
            <Link href={href}>{label}</Link>
          </DropdownMenuItem>
        ))}
        {isSignedIn ? (
          <>
            <DropdownMenuSeparator />
            {signedInLinks.map(([label, href]) => (
              <DropdownMenuItem asChild key={href}>
                <Link href={href}>{label}</Link>
              </DropdownMenuItem>
            ))}
            {isModerator ? (
              <DropdownMenuItem asChild>
                <Link href="/moderation">Moderation</Link>
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
