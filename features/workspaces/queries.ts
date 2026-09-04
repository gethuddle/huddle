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

export async function listMyWorkspaces(): Promise<readonly WorkspaceSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_workspaces");
  if (error !== null) throw new DomainError("INTERNAL_ERROR", { cause: error });
  return mapWorkspaceRows(data);
}

export async function listMyRecoverableWorkspaces(): Promise<readonly WorkspaceSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_workspace_recovery");
  if (error !== null) throw new DomainError("INTERNAL_ERROR", { cause: error });
  return mapWorkspaceRows(data);
}

export async function getAppShellState(): Promise<AppShellState> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error !== null || typeof data?.claims.sub !== "string") {
    return {
      isSignedIn: false,
      workspace: { active: null, available: [], isModerator: false },
    };
  }

  const [workspaceResult, moderatorResult, cookieStore] = await Promise.all([
    supabase.rpc("list_my_workspaces"),
    supabase.rpc("viewer_is_platform_moderator"),
    cookies(),
  ]);

  let available: readonly WorkspaceSummary[] = [];
  if (workspaceResult.error === null) {
    try {
      available = mapWorkspaceRows(workspaceResult.data);
    } catch {
      available = [];
    }
  }
  const remembered = parseWorkspaceCookie(cookieStore.get(WORKSPACE_COOKIE_NAME)?.value);

  return {
    isSignedIn: true,
    workspace: {
      active: chooseWorkspace(available, remembered),
      available,
      isModerator: moderatorResult.error === null && moderatorResult.data === true,
    },
  };
}

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

export const getAuthorizedVenueWorkspaceBySlug = cache(
  async function getAuthorizedVenueWorkspaceBySlug(
    slug: string,
  ): Promise<AuthorizedVenueWorkspace | null> {
    let available: readonly WorkspaceSummary[];
    try {
      available = await listMyWorkspaces();
    } catch {
      // Workspace routes are private. Authentication, authorization, and
      // projection failures therefore share the same non-disclosing result.
      return null;
    }
    const workspace = available.find(
      (candidate) => candidate.kind === "venue" && candidate.slug === slug,
    );
    if (workspace === undefined) return null;
    try {
      const venue = await getVenueWorkspace(workspace.id);
      if (venue === null) return null;
      return { ...venue, billing: await getVenueBillingContext(workspace.id) };
    } catch {
      return null;
    }
  },
);
