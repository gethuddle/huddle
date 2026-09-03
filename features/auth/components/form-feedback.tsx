import type { AuthActionState } from "@/features/auth/state";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
      <Alert className="border-court/30 bg-court/10 text-forest-hover" role="status">
        <AlertDescription className="text-forest-hover">{state.data.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertDescription className="text-sand">
        {state.error.fields?._form?.[0] ?? state.error.message}
      </AlertDescription>
    </Alert>
  );
}
