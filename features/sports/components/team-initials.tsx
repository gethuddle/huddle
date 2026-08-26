import { cn } from "@/lib/utils";

type TeamInitialsProps = Readonly<{
  name: string;
  tla: string | null;
  className?: string;
}>;

export function teamInitials(name: string, tla: string | null): string {
  if (tla !== null && tla.trim().length >= 2) return tla.trim().slice(0, 3).toUpperCase();

  const words = name
    .replace(/\b(?:fc|cf|afc)\b/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = words
    .slice(0, 3)
    .map((word) => word.at(0))
    .join("")
    .toUpperCase();

  return initials.length >= 2 ? initials : name.trim().slice(0, 3).toUpperCase();
}

export function TeamInitials({ name, tla, className }: TeamInitialsProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-deep text-xs font-bold tracking-[0.08em] text-linen",
        className,
      )}
    >
      {teamInitials(name, tla)}
    </span>
  );
}
