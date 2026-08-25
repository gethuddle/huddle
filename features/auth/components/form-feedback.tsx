import type { AuthActionState } from "@/features/auth/state";

type FieldErrorProps = Readonly<{
  id: string;
  messages: string[] | undefined;
}>;

export function FieldError({ id, messages }: FieldErrorProps) {
  if (messages === undefined || messages.length === 0) {
    return null;
  }

  return (
    <span className="mt-2 block text-sm text-sand" id={id}>
      {messages[0]}
    </span>
  );
}

export function FormFeedback({ state }: Readonly<{ state: AuthActionState }>) {
  if (state === null) {
    return null;
  }

  if (state.ok) {
    return (
      <p
        className="rounded-xl border border-court/30 bg-court/10 px-4 py-3 text-sm leading-6 text-court-hover"
        role="status"
      >
        {state.data.message}
      </p>
    );
  }

  return (
    <p
      className="rounded-xl border border-sand/30 bg-sand/10 px-4 py-3 text-sm leading-6 text-sand"
      role="alert"
    >
      {state.error.message}
    </p>
  );
}

export const AUTH_INPUT_CLASS_NAME =
  "mt-2 w-full rounded-xl border border-border-strong bg-surface-deep px-4 py-3 text-base text-linen placeholder:text-muted-dark/70 transition focus:border-court focus:outline-none focus:ring-2 focus:ring-court/25";

export const AUTH_SUBMIT_CLASS_NAME =
  "w-full rounded-xl bg-court px-5 py-3.5 text-sm font-semibold text-ink transition hover:bg-court-hover focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70";
