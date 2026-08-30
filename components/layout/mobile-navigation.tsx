import { FanBottomNavigation } from "@/features/workspaces/components/fan-bottom-navigation";
import { VenueMobileNavigation } from "@/features/workspaces/components/venue-workspace-header";
import type { WorkspaceShellContext } from "@/features/workspaces/types";

export function MobileNavigation({ context }: Readonly<{ context: WorkspaceShellContext }>) {
  if (context.active?.kind === "fan") return <FanBottomNavigation />;
  if (context.active?.kind === "venue" && context.active.slug !== null) {
    return <VenueMobileNavigation slug={context.active.slug} />;
  }
  return null;
}
