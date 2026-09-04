import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireActor } from "@/features/auth/actor";
import {
  AppealReviewControl,
  ModerationReversalControl,
  ReportAssignmentControl,
  ReportDecisionControls,
} from "@/features/moderation/components/moderation-controls";
import {
  listModerationAppeals,
  listModerationReports,
  listPlatformModerationActions,
  viewerIsPlatformModerator,
} from "@/features/moderation/queries";
import {
  appealStatusFilterSchema,
  moderationPageSchema,
  reportStatusFilterSchema,
} from "@/features/moderation/schemas";
import { DomainError } from "@/lib/errors";

export const metadata: Metadata = { title: "Platform moderation — Huddle" };

type Props = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function ModerationPage({ searchParams }: Props) {
  const raw = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const page = moderationPageSchema.parse(first(raw.page));
  const reportStatus = reportStatusFilterSchema.parse(first(raw.reportStatus) ?? null);
  const appealStatus = appealStatusFilterSchema.parse(first(raw.appealStatus) ?? null);

  let moderatorId: string;
  try {
    const actor = await requireActor("common");
    if (!(await viewerIsPlatformModerator())) notFound();
    moderatorId = actor.profile.id;
  } catch (error) {
    if (error instanceof DomainError && error.code !== "INTERNAL_ERROR") notFound();
    throw error;
  }

  const [reports, actions, appeals] = await Promise.all([
    listModerationReports(reportStatus, page),
    listPlatformModerationActions(page),
    listModerationAppeals(appealStatus, page),
  ]);

  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-sand">Platform-only workspace</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
            Moderation queue.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
            Group administrators have no access here. Assign each confidential report, apply the
            least severe effective action with a reason, and leave auditable reversal evidence.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Open your safety center</Link>
        </Button>
      </div>

      <nav aria-label="Report status filters" className="mt-10 flex flex-wrap gap-2">
        {[null, "open", "reviewing", "resolved", "dismissed"].map((status) => (
          <Button
            asChild
            key={status ?? "all"}
            size="sm"
            variant={reportStatus === status ? "default" : "outline"}
          >
            <Link
              aria-current={reportStatus === status ? "page" : undefined}
              href={status === null ? "?" : `?reportStatus=${status}`}
            >
              {status ?? "all reports"}
            </Link>
          </Button>
        ))}
      </nav>

      <section aria-labelledby="moderation-reports-heading" className="mt-8">
        <h2 className="sr-only" id="moderation-reports-heading">
          Confidential reports
        </h2>
        {reports.length === 0 ? (
          <EmptyState
            description="No confidential report matches this status."
            headingLevel="h3"
            title="The report queue is clear."
          />
        ) : (
          <div className="space-y-5">
            {reports.map((report) => (
              <Card key={report.report_id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {identityLabel("Reported by", report.reporter_handle)}
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-foreground">
                        {report.target_label}
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{report.target_type}</Badge>
                      <Badge
                        variant={
                          report.category === "immediate_danger" ? "destructive" : "secondary"
                        }
                      >
                        {report.category.replaceAll("_", " ")}
                      </Badge>
                      <Badge variant="outline">{report.status}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                    {report.details}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Received {formatDate(report.created_at)}
                  </p>
                  <div className="mt-5">
                    {report.status === "open" ? (
                      <ReportAssignmentControl reportId={report.report_id} />
                    ) : report.status === "reviewing" && report.assigned_to_me ? (
                      <ReportDecisionControls
                        reportId={report.report_id}
                        targetType={report.target_type}
                      />
                    ) : report.status === "reviewing" ? (
                      <p className="text-sm font-semibold text-muted-foreground">
                        Assigned to another moderator.
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        This report has a terminal outcome.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="active-actions-heading" className="mt-16">
        <div>
          <p className="text-sm font-medium text-forest">Audited product state</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground" id="active-actions-heading">
            Active enforcement actions
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Timed restrictions and suspensions remain enforced until a moderator reviews the
            deadline and records an explicit reversal. This keeps product-state changes and the
            audit trail together.
          </p>
        </div>

        {actions.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">
            No active enforcement action is recorded.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {actions.map((item) => (
              <Card key={item.moderation_action_id} size="sm">
                <CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-foreground">{item.target_label}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{item.target_type}</Badge>
                      <Badge variant="destructive">{item.action.replaceAll("_", " ")}</Badge>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">{item.reason}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Recorded {formatDate(item.created_at)}
                    {item.expires_at === null ? "" : ` · Review due ${formatDate(item.expires_at)}`}
                  </p>
                  {item.has_active_appeal ? (
                    <p className="mt-5 text-sm font-semibold text-muted-foreground">
                      An active appeal must be decided from the appeal queue before this action can
                      be reversed.
                    </p>
                  ) : (
                    <ModerationReversalControl moderationActionId={item.moderation_action_id} />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="moderation-appeals-heading" className="mt-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-forest">Independent review</p>
            <h2
              className="mt-2 text-2xl font-semibold text-foreground"
              id="moderation-appeals-heading"
            >
              Appeals
            </h2>
          </div>
          <nav aria-label="Appeal status filters" className="flex flex-wrap gap-2">
            {[null, "open", "reviewing", "upheld", "modified", "reversed"].map((status) => (
              <Button
                asChild
                key={status ?? "all"}
                size="sm"
                variant={appealStatus === status ? "default" : "outline"}
              >
                <Link
                  aria-current={appealStatus === status ? "page" : undefined}
                  href={status === null ? "?" : `?appealStatus=${status}`}
                >
                  {status ?? "all"}
                </Link>
              </Button>
            ))}
          </nav>
        </div>

        {appeals.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">No appeal matches this status.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {appeals.map((appeal) => (
              <Card key={appeal.appeal_id} size="sm">
                <CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-foreground">
                      {identityLabel("", appeal.appellant_handle)}
                    </p>
                    <div className="flex gap-2">
                      <Badge variant="outline">{appeal.action.replaceAll("_", " ")}</Badge>
                      <Badge variant="outline">{appeal.status}</Badge>
                    </div>
                  </div>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                    {appeal.appeal_reason}
                  </p>
                  {appeal.status === "open" || appeal.status === "reviewing" ? (
                    !appeal.can_current_moderator_review ? (
                      <p className="mt-5 text-sm font-semibold text-sand">
                        {appeal.original_moderator_id === moderatorId
                          ? "You made the original decision. Another active moderator must review this appeal where one is available."
                          : "You are affected by this decision. Another moderator must review the appeal."}
                      </p>
                    ) : (
                      <AppealReviewControl appealId={appeal.appeal_id} />
                    )
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {page > 1 || reports.length === 20 || actions.length === 20 || appeals.length === 20 ? (
        <nav aria-label="Moderation queue pages" className="mt-10 flex justify-center gap-3">
          {page > 1 ? (
            <Button asChild variant="outline">
              <Link href={`?page=${page - 1}`}>Previous</Link>
            </Button>
          ) : null}
          {reports.length === 20 || actions.length === 20 || appeals.length === 20 ? (
            <Button asChild variant="outline">
              <Link href={`?page=${page + 1}`}>Next</Link>
            </Button>
          ) : null}
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

function identityLabel(prefix: string, handle: string | null) {
  const identity = handle === null ? "Account unavailable" : `@${handle}`;
  return prefix.length === 0 ? identity : `${prefix} ${identity}`;
}
