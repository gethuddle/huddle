import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireActor } from "@/features/auth/actor";
import { AppealControl } from "@/features/moderation/components/appeal-control";
import {
  listMyModerationActions,
  listMyModerationAppeals,
  listMyReports,
} from "@/features/moderation/queries";
import { moderationPageSchema } from "@/features/moderation/schemas";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { DomainError } from "@/lib/errors";

export const metadata: Metadata = { title: "Safety and reports — Huddle" };

type Props = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function ReportsPage({ searchParams }: Props) {
  const rawPage = (await searchParams).page;
  const page = moderationPageSchema.parse(Array.isArray(rawPage) ? rawPage[0] : rawPage);

  try {
    await requireActor("safety");
  } catch (error) {
    if (error instanceof DomainError && error.code === "AUTH_REQUIRED") {
      return (
        <ProfileAccessState
          actionHref="/auth/sign-in"
          actionLabel="Sign in"
          description="Reports and appeals belong to a verified Huddle account."
          eyebrow="Sign in required"
          title="Sign in to open your safety center."
        />
      );
    }
    if (error instanceof DomainError && error.code !== "INTERNAL_ERROR") {
      return (
        <ProfileAccessState
          actionHref="/auth/verify"
          actionLabel="Review verification"
          description="Confirm your email to open the safety center. Adult attestation, current-rules acceptance, restriction, and suspension never remove verified safety access."
          eyebrow="Verification required"
          title="Verify your email to use safety tools."
          warning
        />
      );
    }
    throw error;
  }

  const [reports, actions, appeals] = await Promise.all([
    listMyReports(page),
    listMyModerationActions(page),
    listMyModerationAppeals(page),
  ]);

  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">
            Safety center
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
            Reports and appeals.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-dark">
            Your report details and identity remain hidden from the reported person and group
            administrators. You see only a safe progress state—not internal investigation notes.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/discover">Return to discovery</Link>
        </Button>
      </div>

      <section aria-labelledby="reports-heading" className="mt-12">
        <h2 className="text-2xl font-semibold text-linen" id="reports-heading">
          Your reports
        </h2>
        {reports.length === 0 ? (
          <EmptyState
            description="Use the confidential report control on a profile, group, venue, or event when something violates the community rules."
            headingLevel="h3"
            title="No reports submitted."
          />
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {reports.map((report) => (
              <Card key={report.report_id} size="sm">
                <CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-linen">{report.target_label}</p>
                    <Badge variant="outline">{report.safe_status}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-dark">
                    {report.target_type} · {report.category.replaceAll("_", " ")}
                  </p>
                  <p className="mt-3 text-xs text-muted-dark">
                    Submitted {formatDate(report.created_at)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="actions-heading" className="mt-12">
        <h2 className="text-2xl font-semibold text-linen" id="actions-heading">
          Actions affecting you
        </h2>
        {actions.length === 0 ? (
          <p className="mt-4 text-sm text-muted-dark">No platform moderation action affects you.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {actions.map((item) => (
              <Card key={item.moderation_action_id} size="sm">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-linen">
                      {item.action.replaceAll("_", " ")}
                    </h3>
                    <Badge variant={item.reversed_at === null ? "destructive" : "outline"}>
                      {item.reversed_at === null ? "active decision" : "reversed"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-dark">{item.reason}</p>
                  <p className="mt-3 text-xs text-muted-dark">
                    Target: {item.target_label} · Recorded {formatDate(item.created_at)}
                    {item.expires_at === null ? "" : ` · Review due ${formatDate(item.expires_at)}`}
                  </p>
                  {item.reversal_reason === null ? null : (
                    <p className="mt-4 text-sm text-court-hover">
                      Reversal outcome: {item.reversal_reason}
                    </p>
                  )}
                  {item.reversed_at === null && !item.has_active_appeal ? (
                    <AppealControl moderationActionId={item.moderation_action_id} />
                  ) : item.has_active_appeal ? (
                    <p className="mt-4 text-sm font-semibold text-court">Appeal under review.</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="appeals-heading" className="mt-12">
        <h2 className="text-2xl font-semibold text-linen" id="appeals-heading">
          Appeal outcomes
        </h2>
        {appeals.length === 0 ? (
          <p className="mt-4 text-sm text-muted-dark">No appeals submitted.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {appeals.map((appeal) => (
              <Card key={appeal.appeal_id} size="sm">
                <CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-linen">{appeal.action.replaceAll("_", " ")}</p>
                    <Badge variant="outline">{appeal.status}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-dark">{appeal.reason}</p>
                  {appeal.outcome_reason === null ? null : (
                    <p className="mt-4 text-sm font-semibold text-court-hover">
                      Outcome: {appeal.outcome_reason}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {page > 1 || reports.length === 20 || actions.length === 20 || appeals.length === 20 ? (
        <nav aria-label="Safety history pages" className="mt-10 flex justify-center gap-3">
          <Button asChild={page > 1} disabled={page <= 1} variant="outline">
            {page > 1 ? <Link href={`?page=${page - 1}`}>Previous</Link> : <span>Previous</span>}
          </Button>
          <Button
            asChild={reports.length === 20 || actions.length === 20 || appeals.length === 20}
            disabled={reports.length < 20 && actions.length < 20 && appeals.length < 20}
            variant="outline"
          >
            {reports.length === 20 || actions.length === 20 || appeals.length === 20 ? (
              <Link href={`?page=${page + 1}`}>Next</Link>
            ) : (
              <span>Next</span>
            )}
          </Button>
        </nav>
      ) : null}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(value));
}
