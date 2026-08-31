import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AuthCardProps = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}>;

export function AuthCard({ eyebrow, title, description, children, footer }: AuthCardProps) {
  return (
    <Card className="mx-auto my-14 w-full max-w-xl rounded-[2rem] sm:my-20">
      <CardHeader className="px-7 sm:px-10">
        <p className="text-sm font-medium text-forest">{eyebrow}</p>
        <CardTitle className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-foreground">
          <h1>{title}</h1>
        </CardTitle>
        <CardDescription className="mt-2 leading-7">{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-7 sm:px-10">{children}</CardContent>
      <CardFooter className="px-7 text-sm text-muted-foreground sm:px-10">{footer}</CardFooter>
    </Card>
  );
}
