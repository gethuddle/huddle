import { ArrowRight, MapPin, UsersRound } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { GroupSearchItem } from "@/features/groups/search";

export function GroupCard({ group }: Readonly<{ group: GroupSearchItem }>) {
  return (
    <Card className="h-full transition hover:border-court/40 hover:bg-muted">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="text-xl text-foreground">{group.name}</CardTitle>
          {group.teamName === null ? null : <Badge variant="outline">{group.teamName}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{group.description}</p>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin aria-hidden="true" className="size-4" />
            {group.cityName}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UsersRound aria-hidden="true" className="size-4" />
            {group.activeMemberCount} active members
          </span>
        </div>
      </CardContent>
      <CardFooter className="mt-auto justify-end">
        <Link
          className="inline-flex items-center gap-1 text-sm font-semibold text-forest hover:text-forest-hover"
          href={`/groups/${group.slug}`}
        >
          View group
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </CardFooter>
    </Card>
  );
}
