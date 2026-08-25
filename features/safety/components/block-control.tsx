"use client";

import { useActionState, useState } from "react";

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
      {confirmingBlock ? (
        <div
          aria-describedby="block-confirmation-description"
          aria-labelledby="block-confirmation-title"
          className="rounded-2xl border border-sand/30 bg-sand/10 p-5"
          role="alertdialog"
        >
          <h2 className="font-semibold text-linen" id="block-confirmation-title">
            Block @{targetHandle}?
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-dark" id="block-confirmation-description">
            They will not be notified. Future direct interactions between you will be unavailable.
          </p>
          <form
            action={formAction}
            className="mt-4 flex flex-wrap gap-3"
            onSubmit={() => setConfirmingBlock(false)}
          >
            <input name="targetHandle" type="hidden" value={targetHandle} />
            <input name="intent" type="hidden" value="block" />
            <button
              autoFocus
              className="rounded-xl bg-sand px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-linen focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
              disabled={pending}
              type="submit"
            >
              {pending ? "Updating…" : "Confirm block"}
            </button>
            <button
              className="rounded-xl border border-border-strong px-5 py-2.5 text-sm font-semibold text-linen transition hover:border-linen focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => setConfirmingBlock(false)}
              type="button"
            >
              Cancel
            </button>
          </form>
        </div>
      ) : (
        <button
          className="rounded-xl border border-border-strong px-5 py-3 text-sm font-semibold text-muted-dark transition hover:border-sand hover:text-sand focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
          disabled={pending}
          onClick={() => setConfirmingBlock(true)}
          type="button"
        >
          {pending ? "Updating…" : `Block @${targetHandle}`}
        </button>
      )}
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
