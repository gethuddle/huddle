"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireActor } from "@/features/auth/actor";
import { groupCreationSchema } from "@/features/groups/schemas";
import type {
  GroupCreationActionState,
  GroupCreationFormValues,
  GroupCreationValues,
} from "@/features/groups/state";
import { DomainError, domainErrorFromDatabase, toActionError } from "@/lib/errors";
import { getRequestId } from "@/lib/request-id/server";

const similarGroupRowSchema = z
  .object({
    group_id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    lifecycle: z.enum(["forming", "active"]),
    team_name: z.string().nullable(),
    similarity_score: z.number(),
  })
  .strict();

const createdGroupRowSchema = z
  .object({
    group_id: z.uuid(),
    slug: z.string(),
    lifecycle: z.enum(["forming", "active"]),
  })
  .strict();

function creationInput(formData: FormData) {
  return {
    intent: formData.get("intent"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    teamId: formData.get("teamId"),
    visibility: formData.get("visibility"),
    description: formData.get("description"),
  };
}

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function submittedValues(formData: FormData): GroupCreationFormValues {
  return {
    name: formString(formData.get("name")),
    slug: formString(formData.get("slug")),
    teamId: formString(formData.get("teamId")),
    visibility: formString(formData.get("visibility")),
    description: formString(formData.get("description")),
  };
}

function groupCreationFailure(
  error: unknown,
  values: GroupCreationFormValues,
  previousState: GroupCreationActionState,
): GroupCreationActionState {
  return {
    ok: false,
    error: toActionError(error),
    values,
    attempt: previousState?.ok === false ? previousState.attempt + 1 : 1,
  };
}

function valuesFromInput(input: z.infer<typeof groupCreationSchema>): GroupCreationValues {
  return {
    name: input.name,
    slug: input.slug,
    teamId: input.teamId,
    visibility: input.visibility,
    description: input.description,
  };
}

function sameValues(first: GroupCreationValues, second: GroupCreationValues): boolean {
  return (
    first.name === second.name &&
    first.slug === second.slug &&
    first.teamId === second.teamId &&
    first.visibility === second.visibility &&
    first.description === second.description
  );
}

export async function createGroupAction(
  previousState: GroupCreationActionState,
  formData: FormData,
): Promise<GroupCreationActionState> {
  const formValues = submittedValues(formData);
  const parsed = groupCreationSchema.safeParse(creationInput(formData));
  if (!parsed.success) return groupCreationFailure(parsed.error, formValues, previousState);

  const values = valuesFromInput(parsed.data);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);

    if (parsed.data.intent === "check") {
      const { data, error } = await supabase.rpc("suggest_similar_groups", {
        input_name: parsed.data.name,
        // The generated RPC type does not preserve nullable SQL arguments.
        input_team_id: parsed.data.teamId as string,
        input_limit: 5,
      });
      if (error !== null) throw domainErrorFromDatabase(error);

      const rows = z.array(similarGroupRowSchema).parse(data);
      return {
        ok: true,
        data: {
          phase: "review",
          message:
            rows.length === 0
              ? "No similar discoverable groups found."
              : "Review these discoverable groups before creating another.",
          values,
          suggestions: rows.map((row) => ({
            id: row.group_id,
            slug: row.slug,
            name: row.name,
            lifecycle: row.lifecycle,
            teamName: row.team_name,
          })),
        },
      };
    }

    if (
      previousState?.ok !== true ||
      previousState.data.phase !== "review" ||
      !sameValues(previousState.data.values, values)
    ) {
      throw new DomainError("VALIDATION_FAILED", {
        fields: { _form: ["Check similar groups again after changing the form."] },
      });
    }

    const { data, error } = await supabase.rpc("create_group", {
      input_name: parsed.data.name,
      input_slug: parsed.data.slug,
      input_team_id: parsed.data.teamId as string,
      input_visibility: parsed.data.visibility,
      input_description: parsed.data.description,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    const row = createdGroupRowSchema.parse(data.at(0));
    revalidatePath(`/groups/${row.slug}`);

    return {
      ok: true,
      data: {
        phase: "created",
        message: "Group created. You are its active owner.",
        visibility: values.visibility,
        group: { id: row.group_id, slug: row.slug, lifecycle: row.lifecycle },
      },
    };
  } catch (error) {
    return groupCreationFailure(error, formValues, previousState);
  }
}
