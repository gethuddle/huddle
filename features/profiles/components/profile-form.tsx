"use client";

import { useActionState, useEffect } from "react";

import { CURRENT_COMMUNITY_RULES } from "@/content/community-rules";
import { saveProfileAction } from "@/features/profiles/actions";
import { INITIAL_PROFILE_ACTION_STATE, type ProfileActionState } from "@/features/profiles/state";

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
  initialValue: ProfileFormInitialValue;
}>;

const INPUT_CLASS_NAME =
  "mt-2 w-full rounded-xl border border-border-strong bg-surface-deep px-4 py-3 text-base text-linen placeholder:text-muted-dark/70 transition focus:border-court focus:outline-none focus:ring-2 focus:ring-court/25";

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
    <p
      className={
        state.ok
          ? "rounded-xl border border-court/30 bg-court/10 px-4 py-3 text-sm leading-6 text-court-hover"
          : "rounded-xl border border-sand/30 bg-sand/10 px-4 py-3 text-sm leading-6 text-sand"
      }
      role={state.ok ? "status" : "alert"}
    >
      {state.ok ? state.data.message : state.error.message}
    </p>
  );
}

export function ProfileForm({ cities, initialValue }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    saveProfileAction,
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
      window.location.assign(state.data.redirectTo);
    }
  }, [state]);

  return (
    <form
      action={formAction}
      className="space-y-7"
      key={state?.ok === false ? state.attempt : 0}
      noValidate
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="text-sm font-semibold text-linen" htmlFor="profile-display-name">
            Display name
          </label>
          <input
            aria-describedby="profile-display-name-error"
            aria-invalid={fieldErrors?.displayName === undefined ? undefined : true}
            autoComplete="name"
            className={INPUT_CLASS_NAME}
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
          <label className="text-sm font-semibold text-linen" htmlFor="profile-handle">
            Handle
          </label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-[1.05rem] text-muted-dark"
            >
              @
            </span>
            <input
              aria-describedby="profile-handle-help profile-handle-error"
              aria-invalid={fieldErrors?.handle === undefined ? undefined : true}
              autoCapitalize="none"
              autoComplete="username"
              className={`${INPUT_CLASS_NAME} pl-9`}
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
        <label className="text-sm font-semibold text-linen" htmlFor="profile-city">
          Israel city
        </label>
        <select
          aria-describedby="profile-city-help profile-city-error"
          aria-invalid={fieldErrors?.citySlug === undefined ? undefined : true}
          className={INPUT_CLASS_NAME}
          defaultValue={values.citySlug}
          id="profile-city"
          name="citySlug"
          required
        >
          <option value="">Choose a city</option>
          {cities.map((city) => (
            <option key={city.id} value={city.slug}>
              {city.name}
            </option>
          ))}
        </select>
        <span className="mt-2 block text-xs text-muted-dark" id="profile-city-help">
          This is your fallback when you do not share browser location.
        </span>
        <FieldError id="profile-city-error" messages={fieldErrors?.citySlug} />
      </div>

      <div>
        <label className="text-sm font-semibold text-linen" htmlFor="profile-bio">
          Short bio <span className="font-normal text-muted-dark">(optional)</span>
        </label>
        <textarea
          aria-describedby="profile-bio-help profile-bio-error"
          aria-invalid={fieldErrors?.bio === undefined ? undefined : true}
          className={`${INPUT_CLASS_NAME} min-h-28 resize-y`}
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

      <fieldset className="rounded-2xl border border-border-dark bg-surface-deep p-5 sm:p-6">
        <legend className="px-2 text-sm font-semibold text-linen">Adult attestation</legend>
        {initialValue.adultAttested ? (
          <>
            <input name="adultAttested" type="hidden" value="on" />
            <p className="flex items-start gap-3 text-sm leading-6 text-muted-dark">
              <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-court" />
              Your 18+ attestation is recorded. Huddle does not collect your date of birth.
            </p>
          </>
        ) : (
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-linen">
            <input
              aria-describedby="profile-adult-error"
              className="mt-1 size-5 accent-court"
              defaultChecked={values.adultAttested}
              name="adultAttested"
              type="checkbox"
            />
            <span>I confirm that I am 18 or older.</span>
          </label>
        )}
        <FieldError id="profile-adult-error" messages={fieldErrors?.adultAttested} />
      </fieldset>

      <fieldset className="rounded-2xl border border-border-dark bg-surface-deep p-5 sm:p-6">
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
        <input name="rulesVersion" type="hidden" value={CURRENT_COMMUNITY_RULES.version} />
        {initialValue.currentRulesAccepted ? (
          <>
            <input name="rulesAccepted" type="hidden" value="on" />
            <p className="mt-5 flex items-start gap-3 border-t border-border-dark pt-5 text-sm leading-6 text-muted-dark">
              <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-court" />
              You accepted this version of the rules.
            </p>
          </>
        ) : (
          <label className="mt-5 flex cursor-pointer items-start gap-3 border-t border-border-dark pt-5 text-sm leading-6 text-linen">
            <input
              aria-describedby="profile-rules-error"
              className="mt-1 size-5 accent-court"
              defaultChecked={values.rulesAccepted}
              name="rulesAccepted"
              type="checkbox"
            />
            <span>I have read and accept the current Huddle community rules.</span>
          </label>
        )}
        <FieldError id="profile-rules-error" messages={fieldErrors?.rulesAccepted} />
      </fieldset>

      <ProfileFeedback state={state} />

      <button
        className="w-full rounded-xl bg-court px-5 py-3.5 text-sm font-semibold text-ink transition hover:bg-court-hover focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving profile…" : initialValue.completed ? "Save profile" : "Complete profile"}
      </button>
    </form>
  );
}
