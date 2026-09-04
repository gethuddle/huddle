export type WorkspaceKind = "fan" | "venue";

export type WorkspaceSummary = Readonly<{
  kind: WorkspaceKind;
  id: string;
  slug: string | null;
  label: string;
  role: "fan" | "owner" | "admin";
}>;

export type WorkspaceSelection = Readonly<{
  kind: WorkspaceKind;
  id: string;
}>;

export type WorkspaceShellContext = Readonly<{
  active: WorkspaceSummary | null;
  available: readonly WorkspaceSummary[];
  isModerator: boolean;
}>;

export type AppShellState = Readonly<{
  isSignedIn: boolean;
  workspace: WorkspaceShellContext;
}>;
import type { VenueWorkspace } from "@/features/venues/workspace/types";
import type { VenueBillingContext } from "@/features/venue-billing/types";

export type AuthorizedVenueWorkspace = VenueWorkspace & Readonly<{ billing: VenueBillingContext }>;
