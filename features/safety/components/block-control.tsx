"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { startTransition, useActionState, useState, type FormEvent } from "react";

import { setBlockPreferenceAction } from "@/features/safety/actions";
import {
  INITIAL_BLOCK_PREFERENCE_ACTION_STATE,
  type BlockPreferenceActionState,
} from "@/features/safety/state";

type BlockControlProps = Readonly<{
  targetHandle: string;
  initiallyBlocked: boolean;
}>;

export function BlockControl({ targetHandle, initiallyBlocked }: BlockControlProps) {
  const [state, formAction, pending] = useActionState(
    setBlockPreferenceAction,
    INITIAL_BLOCK_PREFERENCE_ACTION_STATE,
  );
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const isBlocked = state?.ok === true ? state.data.intent === "block" : initiallyBlocked;

  function submitBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      formAction(formData);
      setConfirmingBlock(false);
    });
  }

  if (isBlocked) {
    return (
      <div className="space-y-3">
        <form action={formAction}>
          <input name="targetHandle" type="hidden" value={targetHandle} />
          <input name="intent" type="hidden" value="unblock" />
          <button
            className="rounded-xl border border-border-strong px-5 py-3 text-sm font-semibold text-linen transition hover:border-court hover:text-court focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
            disabled={pending}
            type="submit"
          >
            {pending ? "Updating…" : `Unblock @${targetHandle}`}
          </button>
        </form>
        <ActionFeedback state={state} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AlertDialog.Root open={confirmingBlock} onOpenChange={setConfirmingBlock}>
        <AlertDialog.Trigger asChild>
          <button
            className="rounded-xl border border-border-strong px-5 py-3 text-sm font-semibold text-muted-dark transition hover:border-sand hover:text-sand focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
            disabled={pending}
            type="button"
          >
            {pending ? "Updating…" : `Block @${targetHandle}`}
          </button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-40 bg-ink/80" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-sand/30 bg-surface-raised p-5 shadow-2xl focus:outline-none">
            <AlertDialog.Title className="font-semibold text-linen">
              Block @{targetHandle}?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm leading-6 text-muted-dark">
              They will not be notified. Future direct interactions between you will be unavailable.
            </AlertDialog.Description>
            <form className="mt-4 flex flex-wrap gap-3" onSubmit={submitBlock}>
              <input name="targetHandle" type="hidden" value={targetHandle} />
              <input name="intent" type="hidden" value="block" />
              <button
                className="rounded-xl bg-sand px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-linen focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
                disabled={pending}
                type="submit"
              >
                {pending ? "Updating…" : "Confirm block"}
              </button>
              <AlertDialog.Cancel asChild>
                <button
                  className="rounded-xl border border-border-strong px-5 py-2.5 text-sm font-semibold text-linen transition hover:border-linen focus-visible:outline-2 focus-visible:outline-offset-2"
                  type="button"
                >
                  Cancel
                </button>
              </AlertDialog.Cancel>
            </form>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <ActionFeedback state={state} />
    </div>
  );
}

function ActionFeedback({ state }: Readonly<{ state: BlockPreferenceActionState }>) {
  if (state === null) return null;

  return (
    <p className="text-sm text-muted-dark" role={state.ok ? "status" : "alert"}>
      {state.ok ? state.data.message : state.error.message}
    </p>
  );
}
