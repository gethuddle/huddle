"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createGroupAction } from "@/features/groups/actions";
import type { GroupCreationCatalog } from "@/features/groups/catalog";
import {
  INITIAL_GROUP_CREATION_ACTION_STATE,
  type GroupCreationActionData,
} from "@/features/groups/state";

export function GroupCreateForm({ catalog }: Readonly<{ catalog: GroupCreationCatalog }>) {
  const router = useRouter();
  const slugInput = useRef<HTMLInputElement>(null);
  const slugWasEdited = useRef(false);
  const [state, formAction, pending] = useActionState(
    createGroupAction,
    INITIAL_GROUP_CREATION_ACTION_STATE,
  );

  useEffect(() => {
    if (state?.ok === true && state.data.phase === "created") {
      router.replace(`/groups/${state.data.group.slug}?created=1`);
    }
  }, [router, state]);

  if (state?.ok === true && state.data.phase === "created") {
    return (
      <Card className="border-court/30 bg-court/10">
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court">Created</p>
          <CardTitle className="mt-2 text-2xl text-linen">
            <h2>Your group is ready.</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="leading-7 text-muted-dark">
            {state.data.message} Opening it now so you can invite people and keep building.
          </p>
          <Button asChild className="mt-6">
            <Link href={`/groups/${state.data.group.slug}`}>Open group</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const review = state?.ok === true && state.data.phase === "review" ? state.data : null;
  const fieldErrors = state?.ok === false ? state.error.fields : undefined;
  const values =
    state?.ok === false
      ? state.values
      : review === null
        ? {
            name: "",
            slug: "",
            cityId: "",
            teamId: "",
            visibility: "discoverable",
            description: "",
          }
        : {
            ...review.values,
            teamId: review.values.teamId ?? "",
          };

  return (
    <form
      action={formAction}
      className="space-y-7"
      key={state?.ok === false ? `error-${state.attempt}` : review === null ? "draft" : "review"}
      noValidate
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label className="text-linen" htmlFor="group-name">
            Group name
          </Label>
          <Input
            aria-describedby="group-name-error"
            aria-invalid={fieldErrors?.name === undefined ? undefined : true}
            className="mt-2"
            defaultValue={values.name}
            id="group-name"
            maxLength={80}
            name="name"
            onChange={(event) => {
              if (!slugWasEdited.current && slugInput.current !== null) {
                slugInput.current.value = groupSlugFromName(event.target.value);
              }
            }}
            placeholder="Haifa matchday supporters"
            required
          />
          <FieldError id="group-name-error" messages={fieldErrors?.name} />
        </div>

        <div>
          <Label className="text-linen" htmlFor="group-slug">
            Group URL{" "}
            <span aria-hidden="true" className="font-normal text-muted-dark">
              (suggested)
            </span>
          </Label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-[1.05rem] text-muted-dark"
            >
              /groups/
            </span>
            <Input
              aria-label="Group URL"
              aria-describedby="group-slug-help group-slug-error"
              aria-invalid={fieldErrors?.slug === undefined ? undefined : true}
              className="mt-2 pl-[5.4rem]"
              defaultValue={values.slug}
              id="group-slug"
              maxLength={60}
              name="slug"
              onChange={() => {
                slugWasEdited.current = true;
              }}
              placeholder="haifa-matchday"
              ref={slugInput}
              required
            />
          </div>
          <span className="mt-2 block text-xs text-muted-dark" id="group-slug-help">
            Huddle fills this from the group name. You can change it before creating the group.
          </span>
          <FieldError id="group-slug-error" messages={fieldErrors?.slug} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label className="text-linen" htmlFor="group-city">
            City
          </Label>
          <NativeSelect
            aria-describedby="group-city-error"
            aria-invalid={fieldErrors?.cityId === undefined ? undefined : true}
            className="mt-2"
            defaultValue={values.cityId}
            id="group-city"
            name="cityId"
            required
          >
            <NativeSelectOption value="">Choose a city</NativeSelectOption>
            {catalog.cities.map((city) => (
              <NativeSelectOption key={city.id} value={city.id}>
                {city.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError id="group-city-error" messages={fieldErrors?.cityId} />
        </div>

        <div>
          <Label className="text-linen" htmlFor="group-team">
            Team <span className="font-normal text-muted-dark">(optional)</span>
          </Label>
          <NativeSelect className="mt-2" defaultValue={values.teamId} id="group-team" name="teamId">
            <NativeSelectOption value="">No single team</NativeSelectOption>
            {catalog.teams.map((team) => (
              <NativeSelectOption key={team.id} value={team.id}>
                {team.shortName ?? team.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div>
        <Label className="text-linen" htmlFor="group-visibility">
          Visibility
        </Label>
        <NativeSelect
          className="mt-2"
          defaultValue={values.visibility}
          id="group-visibility"
          name="visibility"
        >
          <NativeSelectOption value="discoverable">Discoverable</NativeSelectOption>
          <NativeSelectOption value="unlisted">Unlisted</NativeSelectOption>
        </NativeSelect>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface-deep p-4">
            <p className="font-semibold text-linen">Discoverable</p>
            <p className="mt-1 text-sm leading-6 text-muted-dark">
              People can find it after you finish its description, rules and first activity checks.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-deep p-4">
            <p className="font-semibold text-linen">Unlisted</p>
            <p className="mt-1 text-sm leading-6 text-muted-dark">
              Only people with an invite can join. It will still appear in your My Huddle page.
            </p>
          </div>
        </div>
      </div>

      <div>
        <Label className="text-linen" htmlFor="group-description">
          Description <span className="font-normal text-muted-dark">(optional while forming)</span>
        </Label>
        <Textarea
          aria-describedby="group-description-help group-description-error"
          aria-invalid={fieldErrors?.description === undefined ? undefined : true}
          className="mt-2 resize-y"
          defaultValue={values.description}
          id="group-description"
          maxLength={2000}
          name="description"
          placeholder="Who the group is for and how you watch together"
        />
        <span className="mt-2 block text-xs text-muted-dark" id="group-description-help">
          Tell people who the group is for and what you watch together.
        </span>
        <FieldError id="group-description-error" messages={fieldErrors?.description} />
      </div>

      {review === null ? null : <SimilarGroupReview review={review} />}

      {state === null ? null : (
        <Alert
          className={state.ok ? "border-court/30 bg-court/10" : undefined}
          role={state.ok ? "status" : "alert"}
          variant={state.ok ? "default" : "destructive"}
        >
          <AlertDescription className={state.ok ? "text-court-hover" : "text-sand"}>
            {state.ok ? state.data.message : state.error.message}
          </AlertDescription>
        </Alert>
      )}

      <Button
        disabled={pending}
        name="intent"
        size="lg"
        type="submit"
        value={review === null ? "check" : "create"}
      >
        {pending
          ? review === null
            ? "Checking…"
            : "Creating…"
          : review === null
            ? "Review group"
            : "Create group"}
      </Button>
    </form>
  );
}

function SimilarGroupReview({
  review,
}: Readonly<{
  review: Extract<GroupCreationActionData, { phase: "review" }>;
}>) {
  if (review.suggestions.length === 0) {
    return (
      <div className="rounded-xl border border-court/30 bg-court/10 p-4 text-sm text-court-hover">
        No similar public group was found. You can create this one.
      </div>
    );
  }

  return (
    <div aria-labelledby="similar-groups-heading" className="space-y-3">
      <h2 className="font-semibold text-linen" id="similar-groups-heading">
        Similar discoverable groups
      </h2>
      <p className="text-sm leading-6 text-muted-dark">
        These may be close to what you are creating. You can still continue with your own group.
      </p>
      {review.suggestions.map((group) => (
        <Card key={group.id} size="sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {group.lifecycle === "active" ? (
                <Link
                  className="font-semibold text-linen hover:text-court"
                  href={`/groups/${group.slug}`}
                >
                  {group.name}
                </Link>
              ) : (
                <p className="font-semibold text-linen">{group.name}</p>
              )}
              <p className="mt-1 text-xs text-muted-dark">
                {group.cityName} · {group.teamName ?? "Multi-team"}
              </p>
            </div>
            <Badge variant="outline">{group.lifecycle}</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FieldError({ id, messages }: Readonly<{ id: string; messages?: string[] }>) {
  if (messages === undefined || messages.length === 0) return null;
  return (
    <span className="mt-2 block text-sm text-sand" id={id}>
      {messages[0]}
    </span>
  );
}

function groupSlugFromName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}
