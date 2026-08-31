"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { selectWorkspaceAction } from "@/features/workspaces/actions";
import {
  INITIAL_WORKSPACE_ACTION_STATE,
  type WorkspaceActionState,
} from "@/features/workspaces/state";
import type { WorkspaceSummary } from "@/features/workspaces/types";

type WorkspaceSwitcherProps = Readonly<{
  active: WorkspaceSummary | null;
  available: readonly WorkspaceSummary[];
  align?: "start" | "center" | "end";
  appearance?: "compact" | "identity" | "venue";
}>;

function initials(label: string) {
  return label
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("en-US") ?? "")
    .join("");
}

export function WorkspaceSwitcher({
  active,
  align = "end",
  appearance = "compact",
  available,
}: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    selectWorkspaceAction,
    INITIAL_WORKSPACE_ACTION_STATE,
  );

  useEffect(() => {
    if (state?.ok === true) {
      router.replace(state.data.redirectTo);
      router.refresh();
    }
  }, [router, state]);

  if (available.length === 0) return null;

  return (
    <div className="min-w-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Switch workspace"
            className={`max-w-full rounded-full ${appearance === "compact" ? "" : "min-h-12 gap-2 px-2.5"}`}
            disabled={pending}
            size="sm"
            variant="outline"
          >
            {appearance === "compact" ? null : (
              <span
                aria-hidden="true"
                className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-ink ${appearance === "venue" ? "bg-sand" : "bg-court"}`}
              >
                {initials(active?.label ?? "Huddle") || "H"}
              </span>
            )}
            <span
              className={`min-w-0 text-left ${appearance === "venue" ? "hidden sm:block" : ""}`}
            >
              <span className="block truncate">{active?.label ?? "Choose workspace"}</span>
              {appearance === "venue" ? (
                <span className="block text-[0.68rem] font-medium leading-none text-sand">
                  Venue
                </span>
              ) : null}
            </span>
            <ChevronsUpDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} aria-label="Workspace switcher" className="min-w-64">
          <DropdownMenuLabel>Your workspaces</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {available.map((workspace) => (
            <form action={action} key={`${workspace.kind}:${workspace.id}`}>
              <input name="kind" type="hidden" value={workspace.kind} />
              <input name="id" type="hidden" value={workspace.id} />
              <DropdownMenuItem asChild className="min-h-11 p-0">
                <button
                  className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm"
                  type="submit"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{workspace.label}</span>
                    <span className="block text-xs capitalize text-muted-foreground">
                      {workspace.kind === "fan" ? "Fan" : `${workspace.role} · Venue`}
                    </span>
                  </span>
                  {active?.kind === workspace.kind && active.id === workspace.id ? (
                    <Check aria-label="Current workspace" className="size-4 text-forest" />
                  ) : null}
                </button>
              </DropdownMenuItem>
            </form>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="min-h-11">
            <Link href="/account">Account settings</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {state?.ok === false ? (
        <p className="mt-2 text-xs text-sand" role="alert">
          {state.error.message}
        </p>
      ) : null}
    </div>
  );
}

export type { WorkspaceActionState };
