import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { DomainError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getVenueWorkspace } from "@/features/venues/workspace/queries";
import { getVenueBillingContext } from "@/features/venue-billing/queries";
import type { AuthorizedVenueWorkspace } from "./types";

import { parseWorkspaceCookie, workspaceRowsSchema } from "./schemas";
import { chooseWorkspace, WORKSPACE_COOKIE_NAME } from "./state";
import type { AppShellState, WorkspaceShellContext, WorkspaceSummary } from "./types";

export function mapWorkspaceRows(raw: unknown): readonly WorkspaceSummary[] {
  try {
    return workspaceRowsSchema.parse(raw).map((row) => ({
      kind: row.workspace_kind,
      id: row.workspace_id,
      slug: row.slug,
      label: row.name,
      role: row.role,
    }));
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

export const listMyWorkspaces = cache(async function listMyWorkspaces(): Promise<
  readonly WorkspaceSummary[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_workspaces");
  if (error !== null) throw new DomainError("INTERNAL_ERROR", { cause: error });
  return mapWorkspaceRows(data);
});

export async function listMyRecoverableWorkspaces(): Promise<readonly WorkspaceSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_workspace_recovery");
  if (error !== null) throw new DomainError("INTERNAL_ERROR", { cause: error });
  return mapWorkspaceRows(data);
}

export const getAppShellState = cache(async function getAppShellState(): Promise<AppShellState> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error !== null || typeof data?.claims.sub !== "string") {
    return {
      isSignedIn: false,
      workspace: { active: null, available: [] },
    };
  }

  const [available, cookieStore] = await Promise.all([
    listMyWorkspaces().catch(() => [] as readonly WorkspaceSummary[]),
    cookies(),
  ]);
  const remembered = parseWorkspaceCookie(cookieStore.get(WORKSPACE_COOKIE_NAME)?.value);

  return {
    isSignedIn: true,
    workspace: {
      active: chooseWorkspace(available, remembered),
      available,
    },
  };
});

export async function getWorkspaceShellContext(): Promise<WorkspaceShellContext> {
  return (await getAppShellState()).workspace;
}

export async function getWorkspaceSetupAvailability(): Promise<
  Readonly<{ canStartFan: boolean; canStartVenue: boolean }>
> {
  const unavailable = { canStartFan: false, canStartVenue: false } as const;
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData.user;
  if (
    authError !== null ||
    user === null ||
    user.email_confirmed_at === undefined ||
    user.email_confirmed_at === null
  ) {
    return unavailable;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("suspended_at, community_restricted_at")
    .eq("id", user.id)
    .maybeSingle();
  if (
    error !== null ||
    profile === null ||
    profile.suspended_at !== null ||
    profile.community_restricted_at !== null
  ) {
    return unavailable;
  }

  return { canStartFan: true, canStartVenue: true };
}

export const getAuthorizedVenueWorkspaceSummaryBySlug = cache(
  async function getAuthorizedVenueWorkspaceSummaryBySlug(
    slug: string,
  ): Promise<WorkspaceSummary | null> {
    let available: readonly WorkspaceSummary[];
    try {
      available = await listMyWorkspaces();
    } catch {
      // Workspace routes are private. Authentication, authorization, and
      // projection failures therefore share the same non-disclosing result.
      return null;
    }
    return (
      available.find((candidate) => candidate.kind === "venue" && candidate.slug === slug) ?? null
    );
  },
);

export const getAuthorizedVenueWorkspaceBySlug = cache(
  async function getAuthorizedVenueWorkspaceBySlug(
    slug: string,
  ): Promise<AuthorizedVenueWorkspace | null> {
    const workspace = await getAuthorizedVenueWorkspaceSummaryBySlug(slug);
    if (workspace === null) return null;
    try {
      const [venue, billing] = await Promise.all([
        getVenueWorkspace(workspace.id),
        getVenueBillingContext(workspace.id),
      ]);
      if (venue === null) return null;
      return { ...venue, billing };
    } catch {
      return null;
    }
  },
);
