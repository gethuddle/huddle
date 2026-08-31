import { cn } from "@/lib/utils";

type TeamInitialsProps = Readonly<{
  name: string;
  tla: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
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

  if (initials.length >= 2) return initials;
  const cleanedName = words.join(" ").trim();
  return (cleanedName || name.trim()).slice(0, 3).toUpperCase();
}

export function TeamMark({ name, tla, className, size = "md" }: TeamInitialsProps) {
  return (
    <span
      aria-label={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-muted font-bold tracking-[0.06em] text-forest",
        size === "sm" && "size-8 text-[0.65rem]",
        size === "md" && "size-11 text-xs",
        size === "lg" && "size-14 text-sm",
        className,
      )}
      role="img"
    >
      {teamInitials(name, tla)}
    </span>
  );
}

export const TeamInitials = TeamMark;
