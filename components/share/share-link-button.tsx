"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ShareLinkButton({
  label = "Share",
  title,
}: Readonly<{ label?: string; title: string }>) {
  const [status, setStatus] = useState<"idle" | "shared" | "copied" | "failed">("idle");

  async function share() {
    const currentUrl = new URL(window.location.href);
    currentUrl.search = "";
    currentUrl.hash = "";
    const url = currentUrl.toString();
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        setStatus("shared");
      } else {
        await navigator.clipboard.writeText(url);
        setStatus("copied");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("failed");
    }
  }

  const buttonLabel =
    status === "copied"
      ? "Link copied"
      : status === "shared"
        ? "Shared"
        : status === "failed"
          ? "Try copying the URL"
          : label;

  return (
    <Button onClick={share} size="sm" type="button" variant="outline">
      {status === "copied" || status === "shared" ? (
        <Check aria-hidden="true" />
      ) : (
        <Share2 aria-hidden="true" />
      )}
      <span aria-live="polite">{buttonLabel}</span>
    </Button>
  );
}
