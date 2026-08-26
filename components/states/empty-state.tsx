import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EmptyStateProps = Readonly<{
  title: string;
  description: string;
  action?: ReactNode;
  headingLevel?: "h1" | "h2" | "h3";
}>;

export function EmptyState({
  title,
  description,
  action,
  headingLevel: Heading = "h1",
}: EmptyStateProps) {
  return (
    <Card className="mx-auto my-16 w-full max-w-2xl rounded-[2rem] border border-dashed border-border-strong bg-surface-raised p-8 text-center sm:p-12">
      <CardHeader>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court">
          Nothing here yet
        </p>
        <CardTitle className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-linen">
          <Heading>{title}</Heading>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mx-auto max-w-xl leading-7 text-muted-dark">{description}</p>
        {action === undefined ? null : <div className="mt-7">{action}</div>}
      </CardContent>
    </Card>
  );
}
