"use client";

import { useActionState, useEffect, useRef } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CURRENT_COMMUNITY_RULES } from "@/content/community-rules";
import { activateFanOnboardingAction, saveProfileAction } from "@/features/profiles/actions";
import { INITIAL_PROFILE_ACTION_STATE, type ProfileActionState } from "@/features/profiles/state";
import {
  clearSessionFormDraft,
  onboardingSessionDraftKey,
  readSessionFormDraft,
  restoreFormDraft,
  writeSessionFormDraft,
} from "@/features/onboarding/session-form-draft";

export type CityOption = Readonly<{
  id: string;
  slug: string;
  name: string;
}>;

export type ProfileFormInitialValue = Readonly<{
  handle: string;
  displayName: string;
  citySlug: string;
  bio: string;
  adultAttested: boolean;
  currentRulesAccepted: boolean;
  completed: boolean;
}>;

type ProfileFormProps = Readonly<{
  cities: readonly CityOption[];
  draftOwnerId?: string;
  initialValue: ProfileFormInitialValue;
  mode?: "onboarding" | "settings";
}>;

function FieldError({ id, messages }: Readonly<{ id: string; messages?: string[] }>) {
  if (messages === undefined || messages.length === 0) return null;

  return (
    <span className="mt-2 block text-sm text-sand" id={id}>
      {messages[0]}
    </span>
  );
}

function ProfileFeedback({ state }: Readonly<{ state: ProfileActionState }>) {
  if (state === null) return null;

  return (
    <Alert
      className={state.ok ? "border-court/30 bg-court/10 text-court-hover" : undefined}
      role={state.ok ? "status" : "alert"}
      variant={state.ok ? "default" : "destructive"}
    >
      <AlertDescription className={state.ok ? "text-court-hover" : "text-sand"}>
        {state.ok ? state.data.message : state.error.message}
      </AlertDescription>
    </Alert>
  );
}

export function ProfileForm({
  cities,
  draftOwnerId,
  initialValue,
  mode = "settings",
}: ProfileFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const draftKey =
    mode === "onboarding" && draftOwnerId !== undefined
      ? onboardingSessionDraftKey("fan", draftOwnerId)
      : null;
  const [state, formAction, pending] = useActionState(
    mode === "onboarding" ? activateFanOnboardingAction : saveProfileAction,
    INITIAL_PROFILE_ACTION_STATE,
  );
  const values =
    state?.ok === false
      ? state.values
      : {
          handle: initialValue.handle,
          displayName: initialValue.displayName,
          citySlug: initialValue.citySlug,
          bio: initialValue.bio,
          adultAttested: initialValue.adultAttested,
          rulesAccepted: initialValue.currentRulesAccepted,
        };
  const fieldErrors = state?.ok === false ? state.error.fields : undefined;

  useEffect(() => {
    if (state?.ok === true && state.data.redirectTo !== null) {
      if (draftKey !== null) clearSessionFormDraft(draftKey);
      window.location.assign(state.data.redirectTo);
    }
  }, [draftKey, state]);

  useEffect(() => {
    if (draftKey === null || formRef.current === null) return;
    const draft = readSessionFormDraft<null>(draftKey);
    // Resume substantive profile work, but require legal confirmations fresh. Besides
    // being the safer consent model, this prevents a late hydration restore from
    // replaying a stale unchecked value over the user's current click.
    if (draft !== null) restoreFormDraft(formRef.current, draft, { restoreChecked: false });
  }, [draftKey]);

  return (
    <form
      action={formAction}
      className="space-y-7"
      key={state?.ok === false ? state.attempt : 0}
      noValidate
      onChange={(event) => {
        if (draftKey !== null) {
          writeSessionFormDraft(draftKey, event.currentTarget, null);
        }
      }}
      onInput={(event) => {
        if (draftKey !== null) {
          writeSessionFormDraft(draftKey, event.currentTarget, null);
        }
      }}
      ref={formRef}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label className="text-linen" htmlFor="profile-display-name">
            Display name
          </Label>
          <Input
            aria-describedby="profile-display-name-error"
            aria-invalid={fieldErrors?.displayName === undefined ? undefined : true}
            autoComplete="name"
            className="mt-2"
            defaultValue={values.displayName}
            id="profile-display-name"
            maxLength={60}
            name="displayName"
            placeholder="How people should know you"
            required
          />
          <FieldError id="profile-display-name-error" messages={fieldErrors?.displayName} />
        </div>

        <div>
          <Label className="text-linen" htmlFor="profile-handle">
            Handle
          </Label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-[1.05rem] text-muted-dark"
            >
              @
            </span>
            <Input
              aria-describedby="profile-handle-help profile-handle-error"
              aria-invalid={fieldErrors?.handle === undefined ? undefined : true}
              autoCapitalize="none"
              autoComplete="username"
              className="mt-2 pl-9"
              defaultValue={values.handle}
              id="profile-handle"
              maxLength={30}
              name="handle"
              placeholder="matchday_fan"
              required
            />
          </div>
          <span className="mt-2 block text-xs text-muted-dark" id="profile-handle-help">
            3–30 letters, numbers, or underscores. Huddle stores it in lowercase.
          </span>
          <FieldError id="profile-handle-error" messages={fieldErrors?.handle} />
        </div>
      </div>

      <div>
        <Label className="text-linen" htmlFor="profile-city">
          City
        </Label>
        <NativeSelect
          aria-describedby="profile-city-help profile-city-error"
          aria-invalid={fieldErrors?.citySlug === undefined ? undefined : true}
          className="mt-2"
          defaultValue={values.citySlug}
          id="profile-city"
          name="citySlug"
          required
        >
          <NativeSelectOption value="">Choose a city</NativeSelectOption>
          {cities.map((city) => (
            <NativeSelectOption key={city.id} value={city.slug}>
              {city.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <span className="mt-2 block text-xs text-muted-dark" id="profile-city-help">
          This is your fallback when you do not share browser location.
        </span>
        <FieldError id="profile-city-error" messages={fieldErrors?.citySlug} />
      </div>

      <div>
        <Label className="text-linen" htmlFor="profile-bio">
          Short bio <span className="font-normal text-muted-dark">(optional)</span>
        </Label>
        <Textarea
          aria-describedby="profile-bio-help profile-bio-error"
          aria-invalid={fieldErrors?.bio === undefined ? undefined : true}
          className="mt-2 resize-y"
          defaultValue={values.bio}
          id="profile-bio"
          maxLength={500}
          name="bio"
          placeholder="The clubs, competitions, or match-day atmosphere you enjoy."
        />
        <span className="mt-2 block text-xs text-muted-dark" id="profile-bio-help">
          Plain text only, up to 500 characters. Do not include private contact details.
        </span>
        <FieldError id="profile-bio-error" messages={fieldErrors?.bio} />
      </div>

      <input name="rulesVersion" type="hidden" value={CURRENT_COMMUNITY_RULES.version} />
      {initialValue.adultAttested ? (
        <input name="adultAttested" type="hidden" value="on" />
      ) : (
        <fieldset className="rounded-[1.375rem] border border-border-dark p-5 sm:p-6">
          <legend className="px-2 text-sm font-semibold text-linen">Adult attestation</legend>
          <div className="flex items-start gap-3">
            <Checkbox
              aria-describedby="profile-adult-error"
              className="mt-0.5"
              defaultChecked={values.adultAttested}
              id="profile-adult-attested"
              name="adultAttested"
              value="on"
            />
            <Label
              className="cursor-pointer text-sm leading-6 text-linen"
              htmlFor="profile-adult-attested"
            >
              I confirm that I am 18 or older.
            </Label>
          </div>
          <FieldError id="profile-adult-error" messages={fieldErrors?.adultAttested} />
        </fieldset>
      )}

      {initialValue.currentRulesAccepted ? (
        <input name="rulesAccepted" type="hidden" value="on" />
      ) : (
        <fieldset className="rounded-[1.375rem] border border-border-dark p-5 sm:p-6">
          <legend className="px-2 text-sm font-semibold text-linen">
            {CURRENT_COMMUNITY_RULES.title} · version {CURRENT_COMMUNITY_RULES.version}
          </legend>
          <p className="mt-1 text-sm leading-6 text-muted-dark">
            {CURRENT_COMMUNITY_RULES.introduction}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {CURRENT_COMMUNITY_RULES.sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-sm font-semibold text-linen">{section.title}</h2>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-muted-dark">
                  {section.points.map((point) => (
                    <li className="flex gap-2" key={point}>
                      <span aria-hidden="true" className="text-court">
                        •
                      </span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="mt-5 flex items-start gap-3 border-t border-border-dark pt-5">
            <Checkbox
              aria-describedby="profile-rules-error"
              className="mt-0.5"
              defaultChecked={values.rulesAccepted}
              id="profile-rules-accepted"
              name="rulesAccepted"
              value="on"
            />
            <Label
              className="cursor-pointer text-sm leading-6 text-linen"
              htmlFor="profile-rules-accepted"
            >
              I have read and accept the current Huddle community rules.
            </Label>
          </div>
          <FieldError id="profile-rules-error" messages={fieldErrors?.rulesAccepted} />
        </fieldset>
      )}

      {initialValue.adultAttested && initialValue.currentRulesAccepted ? (
        <section
          aria-label="Eligibility status"
          className="rounded-[1.375rem] border border-border-dark p-5"
        >
          <p className="font-semibold text-linen">Eligibility saved</p>
          <p className="mt-1 text-sm leading-6 text-muted-dark">
            Your 18+ attestation and current community rules acceptance are saved.
          </p>
          <details className="mt-3 text-sm text-muted-dark">
            <summary className="min-h-11 cursor-pointer content-center font-semibold text-linen">
              View eligibility details
            </summary>
            <p className="mt-2 leading-6">
              Huddle does not collect your date of birth. You accepted community rules version{" "}
              {CURRENT_COMMUNITY_RULES.version}.
            </p>
          </details>
        </section>
      ) : initialValue.adultAttested ? (
        <p className="rounded-[1.375rem] border border-border-dark p-4 text-sm text-muted-dark">
          Your 18+ attestation is saved. Review the updated rules below to continue.
        </p>
      ) : initialValue.currentRulesAccepted ? (
        <p className="rounded-[1.375rem] border border-border-dark p-4 text-sm text-muted-dark">
          Your current community rules acceptance is saved.
        </p>
      ) : null}

      <ProfileFeedback state={state} />

      <Button className="w-full" disabled={pending} size="lg" type="submit">
        {pending
          ? "Saving profile…"
          : initialValue.completed
            ? "Save profile"
            : mode === "onboarding"
              ? "Start using Huddle"
              : "Complete profile"}
      </Button>
    </form>
  );
}
