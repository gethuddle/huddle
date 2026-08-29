"use client";

import { ChevronDown, UserRound } from "lucide-react";
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

const accountLinks = [
  ["Profile", "/settings/profile"],
  ["Interests", "/settings/interests"],
  ["Friends", "/settings/friends"],
  ["Safety", "/reports"],
] as const;

const createLinks = [
  ["Create group", "/groups/new"],
  ["Create venue", "/venues/new"],
] as const;

export function AccountNavigation({ isModerator }: Readonly<{ isModerator: boolean }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Open account navigation" size="sm" variant="outline">
          <UserRound aria-hidden="true" />
          Account
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label="Account navigation">
        <DropdownMenuLabel>Your Huddle</DropdownMenuLabel>
        {accountLinks.map(([label, href]) => (
          <DropdownMenuItem asChild key={href}>
            <Link href={href}>{label}</Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Create</DropdownMenuLabel>
        {createLinks.map(([label, href]) => (
          <DropdownMenuItem asChild key={href}>
            <Link href={href}>{label}</Link>
          </DropdownMenuItem>
        ))}
        {isModerator ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/moderation">Moderation</Link>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
