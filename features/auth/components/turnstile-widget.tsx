"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

import type { TurnstileAction } from "@/features/auth/turnstile";

type TurnstileWidgetId = string;
type TurnstileApi = Readonly<{
  render: (
    container: HTMLElement,
    options: Readonly<{
      sitekey: string;
      action: TurnstileAction;
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      theme: "light";
    }>,
  ) => TurnstileWidgetId;
  reset: (widgetId: TurnstileWidgetId) => void;
  remove?: (widgetId: TurnstileWidgetId) => void;
}>;

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function TurnstileWidget({
  action,
  onTokenChange,
  resetKey = 0,
  siteKey,
}: Readonly<{
  action: TurnstileAction;
  onTokenChange?: (token: string) => void;
  resetKey?: unknown;
  siteKey: string;
}>) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<TurnstileWidgetId | null>(null);
  const previousResetKey = useRef<unknown>(resetKey);
  const [token, setToken] = useState("");

  const updateToken = useCallback(
    (value: string) => {
      setToken(value);
      onTokenChange?.(value);
    },
    [onTokenChange],
  );

  const renderWidget = useCallback(() => {
    if (container.current === null || widgetId.current !== null || !window.turnstile) return;
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      action,
      callback: updateToken,
      "error-callback": () => updateToken(""),
      "expired-callback": () => updateToken(""),
      theme: "light",
    });
  }, [action, siteKey, updateToken]);

  useEffect(() => {
    if (previousResetKey.current === resetKey) return;
    previousResetKey.current = resetKey;
    if (widgetId.current !== null) window.turnstile?.reset(widgetId.current);
    updateToken("");
  }, [resetKey, updateToken]);

  useEffect(
    () => () => {
      if (widgetId.current !== null) window.turnstile?.remove?.(widgetId.current);
    },
    [],
  );

  return (
    <div className="space-y-2">
      <Script
        onReady={renderWidget}
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      <div className="min-h-[65px]" ref={container} />
      <input name="cf-turnstile-response" type="hidden" value={token} />
      <p className="sr-only" role="status">
        {token === "" ? "Security check required." : "Security check complete."}
      </p>
    </div>
  );
}
