import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { PublicMatchDto, TeamSummary } from "@/features/sports/dto";
import { formatIsraelKickoff } from "@/features/sports/time";

import { TeamInitials } from "./team-initials";

function TeamRow({ team, side }: Readonly<{ team: TeamSummary; side: "Home" | "Away" }>) {
  return (
    <div className="flex items-center gap-3">
      <TeamInitials name={team.name} tla={team.tla} />
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{team.shortName ?? team.name}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{side}</p>
      </div>
    </div>
  );
}

export function MatchCard({ match }: Readonly<{ match: PublicMatchDto }>) {
  return (
    <Card className="h-full transition hover:border-court/40 hover:bg-muted">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <Badge variant="outline">{match.competition.code ?? match.competition.name}</Badge>
        <span className="text-xs font-medium capitalize text-muted-foreground">
          {match.status === "timed" ? "Scheduled" : match.status}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <TeamRow side="Home" team={match.homeTeam} />
        <Separator />
        <TeamRow side="Away" team={match.awayTeam} />
        <div className="pt-2">
          <p className="font-semibold text-foreground">{formatIsraelKickoff(match.startsAt)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Israel time</p>
        </div>
      </CardContent>
      <CardFooter className="mt-auto justify-between gap-3">
        <span className="truncate text-xs text-muted-foreground">{match.competition.name}</span>
        <Link
          aria-label={`View ${match.homeTeam.name} versus ${match.awayTeam.name}`}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-forest hover:text-forest-hover"
          href={`/matches/${match.id}`}
        >
          Match details
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </CardFooter>
    </Card>
  );
}
