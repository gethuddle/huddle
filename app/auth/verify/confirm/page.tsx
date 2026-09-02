import type { Metadata } from "next";

import { AuthLinkConfirmation } from "@/features/auth/components/auth-link-confirmation";

export const metadata: Metadata = {
  title: "Verify your email — Huddle",
  robots: { index: false, follow: false },
};

export default function VerifyEmailConfirmationPage() {
  return <AuthLinkConfirmation purpose="email" />;
}
