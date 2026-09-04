"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeEmailAction } from "@/features/auth/actions";
import { INITIAL_AUTH_ACTION_STATE } from "@/features/auth/state";
import { FieldError, FormFeedback } from "./form-feedback";

export function ChangeEmailForm() {
  const [email, setEmail] = useState("");
  const [state, action, pending] = useActionState(changeEmailAction, INITIAL_AUTH_ACTION_STATE);
  const errors = state?.ok === false ? state.error.fields : undefined;
  return (
    <form action={action} noValidate>
      <fieldset className="space-y-5" disabled={pending}>
        <div>
          <Label htmlFor="change-email-address">New email address</Label>
          <Input
            className="mt-2"
            id="change-email-address"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            aria-invalid={errors?.email === undefined ? undefined : true}
            aria-describedby="change-email-address-error"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
          <FieldError id="change-email-address-error" messages={errors?.email} />
        </div>
        <div>
          <Label htmlFor="change-email-password">Current password for email change</Label>
          <Input
            className="mt-2"
            id="change-email-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={72}
            required
            aria-invalid={errors?.currentPassword === undefined ? undefined : true}
            aria-describedby="change-email-password-error"
          />
          <FieldError id="change-email-password-error" messages={errors?.currentPassword} />
        </div>
        <FormFeedback state={state} />
        <Button className="w-full" type="submit" disabled={pending}>
          {pending ? "Requesting confirmation…" : "Request email change"}
        </Button>
      </fieldset>
    </form>
  );
}
