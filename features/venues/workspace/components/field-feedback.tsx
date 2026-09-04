"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Errors = Record<string, readonly string[]> | undefined;

export function fieldErrorMessage(errors: Errors, name: string) {
  const messages = Object.entries(errors ?? {})
    .filter(([key]) => key === name || key.startsWith(`${name}.`))
    .flatMap(([, values]) => values);
  return messages.length === 0 ? undefined : messages.join(" ");
}

export function fieldFeedback(errors: Errors, name: string, id: string) {
  const invalid = Object.keys(errors ?? {}).some(
    (key) => key === name || key.startsWith(`${name}.`),
  );
  return {
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? `${id}-error` : undefined,
  };
}

export function FieldError({
  errors,
  name,
  id,
}: Readonly<{ errors: Errors; name: string; id: string }>) {
  const message = fieldErrorMessage(errors, name);
  return message === undefined ? null : (
    <p className="mt-2 text-sm text-destructive" id={`${id}-error`}>
      {message}
    </p>
  );
}

export function FocusInvalidFields({
  errors,
  children,
  pending = false,
}: Readonly<{ errors: Errors; children: ReactNode; pending?: boolean }>) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pending && errors && Object.keys(errors).length > 0) {
      const frame = window.requestAnimationFrame(() =>
        root.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return () => window.cancelAnimationFrame(frame);
    }
  }, [errors, pending]);
  return (
    <div className="contents" ref={root}>
      {children}
    </div>
  );
}
