"use client";

import { useActionState, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { submitReportAction } from "@/features/moderation/actions";
import type { ModerationTargetType, ReportCategory } from "@/features/moderation/schemas";

const categoryLabels: Readonly<Record<ReportCategory, string>> = {
  immediate_danger: "Immediate danger",
  harassment_stalking_sexual_misconduct: "Harassment, stalking, or sexual misconduct",
  hate_discrimination: "Hate or discrimination",
  privacy_exposure: "Privacy exposure or address sharing",
  impersonation_fraud: "Impersonation or fraud",
  dangerous_illegal_activity: "Dangerous or illegal activity",
  spam_scam: "Spam or scam",
  other: "Other rule violation",
};

type ReportControlProps = Readonly<{
  targetType: ModerationTargetType;
  targetId?: string;
  targetHandle?: string;
  targetLabel: string;
}>;

export function ReportControl({
  targetType,
  targetId = "",
  targetHandle = "",
  targetLabel,
}: ReportControlProps) {
  const [state, formAction, pending] = useActionState(submitReportAction, null);
  const [category, setCategory] = useState<ReportCategory>("other");
  const detailsError = state?.ok === false ? state.error.fields?.details?.[0] : undefined;
  const controlId = `${targetType}-${targetId || targetHandle}`;
  const detailsErrorId = `report-details-error-${controlId}`;
  const sensitiveWarningId = `report-sensitive-warning-${controlId}`;

  if (state?.ok === true) {
    return (
      <Alert className="border-court/30 bg-court/10 text-forest-hover" role="status">
        <AlertTitle>Report received</AlertTitle>
        <AlertDescription className="text-forest-hover">{state.data.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <details className="rounded-2xl border border-border bg-muted p-4">
      <summary className="cursor-pointer text-sm font-semibold text-foreground marker:text-sand">
        Report {targetLabel}
      </summary>
      <form action={formAction} className="mt-5 space-y-5" noValidate>
        <input name="targetType" type="hidden" value={targetType} />
        <input name="targetId" type="hidden" value={targetId} />
        <input name="targetHandle" type="hidden" value={targetHandle} />

        <p className="text-sm leading-6 text-muted-foreground">
          Reports are confidential. The reported person and group administrators cannot see who
          submitted one or read its details. Blocking is separate and never requires a report.
        </p>

        <div>
          <Label htmlFor={`report-category-${controlId}`}>What happened?</Label>
          <NativeSelect
            className="mt-2"
            id={`report-category-${controlId}`}
            name="category"
            onChange={(event) => setCategory(event.target.value as ReportCategory)}
            value={category}
          >
            {Object.entries(categoryLabels).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        {category === "immediate_danger" ? (
          <Alert className="border-sand/50 bg-sand/10">
            <AlertTitle className="text-sand">Get urgent help first</AlertTitle>
            <AlertDescription>
              Huddle is not an emergency service and is not monitored around the clock. If anyone is
              in immediate danger, contact local emergency services now. You can still submit this
              report for platform follow-up.
            </AlertDescription>
          </Alert>
        ) : null}

        <div>
          <Label htmlFor={`report-details-${controlId}`}>Details</Label>
          <Textarea
            aria-describedby={
              detailsError === undefined
                ? sensitiveWarningId
                : `${detailsErrorId} ${sensitiveWarningId}`
            }
            aria-invalid={detailsError === undefined ? undefined : true}
            className="mt-2 min-h-32"
            id={`report-details-${controlId}`}
            maxLength={2000}
            minLength={20}
            name="details"
            required
          />
          {detailsError === undefined ? null : (
            <p className="mt-2 text-sm text-sand" id={detailsErrorId}>
              {detailsError}
            </p>
          )}
          <p className="mt-2 text-xs leading-5 text-muted-foreground" id={sensitiveWarningId}>
            Explain what happened without adding passwords, payment data, invite links, or another
            person&apos;s exact home address.
          </p>
        </div>

        {state?.ok === false ? (
          <Alert variant="destructive">
            <AlertDescription className="text-sand">{state.error.message}</AlertDescription>
          </Alert>
        ) : null}

        <Button disabled={pending} type="submit" variant="outline">
          {pending ? "Submitting…" : "Submit confidential report"}
        </Button>
      </form>
    </details>
  );
}
