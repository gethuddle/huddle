import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Set up a Venue — Huddle",
};

export default function NewVenuePage() {
  redirect("/onboarding/venue");
}
