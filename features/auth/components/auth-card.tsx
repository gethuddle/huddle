import type { ReactNode } from "react";

type AuthCardProps = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}>;

export function AuthCard({ eyebrow, title, description, children, footer }: AuthCardProps) {
  return (
    <section className="mx-auto my-14 w-full max-w-xl rounded-[2rem] border border-border-dark bg-surface-raised p-7 shadow-2xl shadow-black/20 sm:my-20 sm:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">{eyebrow}</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-linen">{title}</h1>
      <p className="mt-4 leading-7 text-muted-dark">{description}</p>
      <div className="mt-8">{children}</div>
      <div className="mt-8 border-t border-border-strong pt-6 text-sm text-muted-dark">
        {footer}
      </div>
    </section>
  );
}
