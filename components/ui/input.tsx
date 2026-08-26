import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-xl border border-input bg-secondary px-4 py-3 text-base text-foreground transition outline-none file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
