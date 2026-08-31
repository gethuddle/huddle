"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

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
          <p className="text-sm font-medium text-forest">Created</p>
          <CardTitle className="mt-2 text-2xl text-foreground">
            <h2>Your group is ready.</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="leading-7 text-muted-foreground">
            {state.data.message}{" "}
            {state.data.visibility === "discoverable"
              ? "Opening it now so you can share the application link and review requests."
              : "Opening it now so you can create invitation links for the people you choose."}
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
      <div>
        <Label className="text-foreground" htmlFor="group-name">
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
            if (slugInput.current !== null) {
              slugInput.current.value = groupSlugFromName(event.target.value);
            }
          }}
          placeholder="Haifa matchday crew"
          required
        />
        <FieldError id="group-name-error" messages={fieldErrors?.name} />
        <input defaultValue={values.slug} name="slug" ref={slugInput} type="hidden" />
        <FieldError id="group-slug-error" messages={fieldErrors?.slug} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label className="text-foreground" htmlFor="group-city">
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
          <Label className="text-foreground" htmlFor="group-team">
            Team <span className="font-normal text-muted-foreground">(optional)</span>
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

      <VisibilityChoice defaultValue={values.visibility as "discoverable" | "unlisted"} />

      <div>
        <Label className="text-foreground" htmlFor="group-description">
          Short description
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
        <span className="mt-2 block text-xs text-muted-foreground" id="group-description-help">
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
          <AlertDescription className={state.ok ? "text-forest-hover" : "text-sand"}>
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
      <div className="rounded-xl border border-court/30 bg-court/10 p-4 text-sm text-forest-hover">
        No similar public group was found. You can create this one.
      </div>
    );
  }

  return (
    <div aria-labelledby="similar-groups-heading" className="space-y-3">
      <h2 className="font-semibold text-foreground" id="similar-groups-heading">
        Similar discoverable groups
      </h2>
      <p className="text-sm leading-6 text-muted-foreground">
        These may be close to what you are creating. You can still continue with your own group.
      </p>
      {review.suggestions.map((group) => (
        <Card key={group.id} size="sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {group.lifecycle === "active" ? (
                <Link
                  className="font-semibold text-foreground hover:text-forest"
                  href={`/groups/${group.slug}`}
                >
                  {group.name}
                </Link>
              ) : (
                <p className="font-semibold text-foreground">{group.name}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {group.cityName} · {group.teamName ?? "Multi-team"}
              </p>
            </div>
            <Badge variant="outline">
              {group.lifecycle === "active" ? "Open for applications" : "Setting up"}
            </Badge>
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

function VisibilityChoice({
  defaultValue,
}: Readonly<{ defaultValue: "discoverable" | "unlisted" }>) {
  const [visibility, setVisibility] = useState(defaultValue);
  return (
    <div>
      <Label className="text-foreground" htmlFor="group-visibility">
        Visibility
      </Label>
      <NativeSelect
        className="mt-2"
        defaultValue={defaultValue}
        id="group-visibility"
        name="visibility"
        onChange={(event) =>
          setVisibility(event.currentTarget.value as "discoverable" | "unlisted")
        }
      >
        <NativeSelectOption value="discoverable">Discoverable</NativeSelectOption>
        <NativeSelectOption value="unlisted">Unlisted</NativeSelectOption>
      </NativeSelect>
      <div className="mt-3 rounded-xl border border-border bg-muted p-4">
        <p className="font-semibold text-foreground">What happens next</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {visibility === "discoverable"
            ? "People can find it and apply once the group is ready. An owner or admin reviews each application before anyone joins."
            : "The group stays out of search. An owner or admin creates invitation links for the people they choose, and every request is still reviewed."}
        </p>
      </div>
    </div>
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
