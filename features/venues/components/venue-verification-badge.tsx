type VenueVerificationBadgeProps = Readonly<{
  status: "unverified" | "verified" | "suspended";
}>;

export function VenueVerificationBadge({ status }: VenueVerificationBadgeProps) {
  const label =
    status === "unverified"
      ? "Self-listed venue · business identity not checked by Huddle"
      : status === "verified"
        ? "Business identity checked by Huddle"
        : "Venue unavailable";

  return (
    <span
      aria-label={label}
      className={
        status === "suspended" ? "text-sm text-destructive" : "text-sm text-muted-foreground"
      }
    >
      {label}
    </span>
  );
}
