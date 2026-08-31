import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Explore — Huddle",
  description: "Find fixtures and watch events in one place.",
};

type MatchesPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function MatchesPage({ searchParams }: MatchesPageProps) {
  await searchParams;
  redirect("/discover");
}
