import type { Metadata } from "next";

import { AuthLinkConfirmation } from "@/features/auth/components/auth-link-confirmation";

export const metadata: Metadata = {
  title: "Reset your password — Huddle",
  robots: { index: false, follow: false },
};

export default function ResetPasswordConfirmationPage() {
  return <AuthLinkConfirmation purpose="recovery" />;
}
