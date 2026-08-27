import { Badge } from "@/components/ui/badge";

type VenueVerificationBadgeProps = Readonly<{
  status: "unverified" | "verified" | "suspended";
}>;

export function VenueVerificationBadge({ status }: VenueVerificationBadgeProps) {
  const label =
    status === "unverified"
      ? "Unverified venue"
      : status === "verified"
        ? "Verified venue"
        : "Suspended venue";

  return (
    <Badge aria-label={label} variant={status === "unverified" ? "outline" : "secondary"}>
      {label}
    </Badge>
  );
}
