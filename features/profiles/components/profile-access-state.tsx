import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProfileAccessStateProps = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  warning?: boolean;
}>;

export function ProfileAccessState({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
  warning = false,
}: ProfileAccessStateProps) {
  return (
    <Card
      className="mx-auto my-16 w-full max-w-2xl rounded-[1.375rem] text-center sm:my-24"
      role={warning ? "alert" : undefined}
    >
      <CardHeader className="px-8 sm:px-12">
        <p
          className={warning ? "text-sm font-medium text-sand" : "text-sm font-medium text-forest"}
        >
          {eyebrow}
        </p>
        <CardTitle className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-foreground">
          <h1>{title}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-8 sm:px-12">
        <p className="mx-auto max-w-xl leading-7 text-muted-foreground">{description}</p>
        {actionHref === undefined || actionLabel === undefined ? null : (
          <Button asChild className="mt-8" size="lg">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
