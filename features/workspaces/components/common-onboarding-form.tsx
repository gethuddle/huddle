"use client";

import { useActionState, useEffect } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CURRENT_COMMUNITY_RULES } from "@/content/community-rules";
import { acceptCommonOnboardingAction } from "@/features/workspaces/actions";
import { INITIAL_WORKSPACE_ACTION_STATE } from "@/features/workspaces/state";

export function CommonOnboardingForm({
  submitLabel = "Continue to venue details",
}: Readonly<{ submitLabel?: string }>) {
  const [state, action, pending] = useActionState(
    acceptCommonOnboardingAction,
    INITIAL_WORKSPACE_ACTION_STATE,
  );

  useEffect(() => {
    if (state?.ok === true) window.location.assign(state.data.redirectTo);
  }, [state]);

  return (
    <form action={action} className="space-y-6" noValidate>
      <div className="rounded-2xl border border-border-dark bg-surface-deep p-5">
        <h2 className="text-lg font-semibold text-linen">A safe account comes first</h2>
        <p className="mt-2 text-sm leading-6 text-muted-dark">
          This records the shared safety requirements for your account. It does not create a Fan
          profile or publish a venue.
        </p>
      </div>

      <div className="flex min-h-11 items-start gap-3">
        <Checkbox id="common-adult" name="adultAttested" value="on" />
        <Label className="cursor-pointer text-sm leading-6" htmlFor="common-adult">
          I confirm that I am 18 or older.
        </Label>
      </div>

      <section aria-labelledby="common-rules-title" className="space-y-4">
        <div>
          <h2 className="font-semibold" id="common-rules-title">
            {CURRENT_COMMUNITY_RULES.title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-dark">
            {CURRENT_COMMUNITY_RULES.introduction}
          </p>
        </div>
        <ul className="grid gap-3 text-sm leading-6 text-muted-dark sm:grid-cols-2">
          {CURRENT_COMMUNITY_RULES.sections.flatMap((section) =>
            section.points.map((point) => <li key={`${section.title}:${point}`}>• {point}</li>),
          )}
        </ul>
      </section>

      <input name="rulesVersion" type="hidden" value={CURRENT_COMMUNITY_RULES.version} />
      <div className="flex min-h-11 items-start gap-3">
        <Checkbox id="common-rules" name="rulesAccepted" value="on" />
        <Label className="cursor-pointer text-sm leading-6" htmlFor="common-rules">
          I have read and accept the current Huddle community rules.
        </Label>
      </div>

      {state?.ok === false ? (
        <Alert role="alert" variant="destructive">
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <Button className="w-full" disabled={pending} size="lg" type="submit">
        {pending ? "Saving safety setup…" : submitLabel}
      </Button>
    </form>
  );
}
