"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { RedirectType, redirect } from "next/navigation";
import { z } from "zod";

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";
import { requireActor } from "@/features/auth/actor";
import { actionFailure, actionSuccess, DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { getRequestId } from "@/lib/request-id/server";
import { createClient } from "@/lib/supabase/server";

import {
  commonOnboardingInputSchema,
  commonOnboardingRowsSchema,
  parseWorkspaceCookie,
  venueOnboardingSubmissionSchema,
  workspaceRowsSchema,
  workspaceSelectionSchema,
} from "./schemas";
import {
  chooseWorkspace,
  serializeWorkspaceSelection,
  WORKSPACE_COOKIE_NAME,
  workspaceCookieOptions,
  workspaceLanding,
  type WorkspaceActionState,
} from "./state";

const activatedVenueRowSchema = z
  .object({
    venue_id: z.uuid(),
    slug: z.string().min(1).max(120),
    verification_status: z.literal("unverified"),
  })
  .strict();

function formValue(formData: FormData, name: string) {
  return formData.get(name);
}

export async function selectWorkspaceAction(
  _previousState: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  const selection = workspaceSelectionSchema.safeParse({
    kind: formValue(formData, "kind"),
    id: formValue(formData, "id"),
  });
  if (!selection.success) return actionFailure(selection.error);

  let destination: string;
  try {
    const supabase = await createClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError !== null || typeof claimsData?.claims.sub !== "string") {
      throw new DomainError("AUTH_REQUIRED", { cause: claimsError });
    }
    const { data, error } = await supabase.rpc("list_my_workspaces");
    if (error !== null) throw domainErrorFromDatabase(error);
    const rows = workspaceRowsSchema.parse(data);
    const selected = rows.find(
      (workspace) =>
        workspace.workspace_kind === selection.data.kind &&
        workspace.workspace_id === selection.data.id,
    );
    if (selected === undefined) throw new DomainError("NOT_ALLOWED");

    const cookieStore = await cookies();
    cookieStore.set(
      WORKSPACE_COOKIE_NAME,
      serializeWorkspaceSelection(selection.data),
      workspaceCookieOptions(),
    );
    revalidatePath("/", "layout");
    destination = workspaceLanding({
      kind: selected.workspace_kind,
      id: selected.workspace_id,
      slug: selected.slug,
      label: selected.name,
      role: selected.role,
    });
  } catch (error) {
    return actionFailure(error);
  }
  redirect(destination, RedirectType.replace);
}

export async function acceptCommonOnboardingAction(
  _previousState: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  const parsed = commonOnboardingInputSchema.safeParse({
    adultAttested: formValue(formData, "adultAttested"),
    rulesAccepted: formValue(formData, "rulesAccepted"),
    rulesVersion: formValue(formData, "rulesVersion"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const { supabase } = await requireActor("authenticated");
    const { data, error } = await supabase.rpc("accept_common_onboarding", {
      input_adult_attested: parsed.data.adultAttested,
      input_rules_version: parsed.data.rulesVersion,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    const row = commonOnboardingRowsSchema.parse(data).at(0);
    if (row === undefined) throw new DomainError("INTERNAL_ERROR");

    const { data: currentWorkspaces, error: workspaceError } =
      await supabase.rpc("list_my_workspaces");
    if (workspaceError !== null) throw domainErrorFromDatabase(workspaceError);
    const available = workspaceRowsSchema.parse(currentWorkspaces).map((workspace) => ({
      kind: workspace.workspace_kind,
      id: workspace.workspace_id,
      slug: workspace.slug,
      label: workspace.name,
      role: workspace.role,
    }));
    let redirectTo = "/onboarding/venue";
    let message = "Safety setup saved. Now add your venue.";
    if (available.length > 0) {
      const cookieStore = await cookies();
      const remembered = parseWorkspaceCookie(cookieStore.get(WORKSPACE_COOKIE_NAME)?.value);
      const recovered = chooseWorkspace(available, remembered);
      if (recovered === null) throw new DomainError("INTERNAL_ERROR");
      cookieStore.set(
        WORKSPACE_COOKIE_NAME,
        serializeWorkspaceSelection({ kind: recovered.kind, id: recovered.id }),
        workspaceCookieOptions(),
      );
      redirectTo = workspaceLanding(recovered);
      message = `Rules updated. Returning to ${recovered.label}.`;
    }

    revalidatePath("/", "layout");
    revalidatePath("/onboarding/venue");
    return actionSuccess({
      message,
      redirectTo,
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function activateVenueOnboardingAction(
  rawInput: unknown,
): Promise<WorkspaceActionState> {
  const parsed = venueOnboardingSubmissionSchema.safeParse(rawInput);
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("common"), getRequestId()]);
    const input = parsed.data;
    const { data, error } = await supabase.rpc("create_venue_workspace_auto", {
      input_name: input.name,
      input_address_text: input.address.label,
      input_longitude: input.address.longitude,
      input_latitude: input.address.latitude,
      input_description: input.description,
      input_main_space_name: input.mainSpaceName,
      input_main_space_capacity: input.mainSpaceCapacity as number,
      input_default_attendance_mode: input.defaultAttendanceMode,
      input_facilities: input.facilities,
      input_house_information: input.houseInformation,
      input_default_requires_approval: input.defaultRequiresApproval,
      input_adult_attested: true,
      input_representation_attested: input.representationAttested,
      input_rules_version: CURRENT_COMMUNITY_RULES_VERSION,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    const activated = activatedVenueRowSchema.parse(data.at(0));

    const { data: currentWorkspaces, error: workspaceError } =
      await supabase.rpc("list_my_workspaces");
    if (workspaceError !== null) throw domainErrorFromDatabase(workspaceError);
    const currentRows = workspaceRowsSchema.parse(currentWorkspaces);
    const current = currentRows.find(
      (workspace) =>
        workspace.workspace_kind === "venue" && workspace.workspace_id === activated.venue_id,
    );
    if (current === undefined) throw new DomainError("NOT_ALLOWED");

    const cookieStore = await cookies();
    cookieStore.set(
      WORKSPACE_COOKIE_NAME,
      serializeWorkspaceSelection({ kind: "venue", id: activated.venue_id }),
      workspaceCookieOptions(),
    );
    const redirectTo = `/venues/${activated.slug}/workspace/billing`;

    revalidatePath("/", "layout");
    revalidatePath(`/venues/${activated.slug}`, "layout");
    return actionSuccess({
      message: "Venue details saved. Choose your demo plan in Billing.",
      redirectTo,
    });
  } catch (error) {
    return actionFailure(error);
  }
}
