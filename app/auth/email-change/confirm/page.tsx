import { AuthLinkConfirmation } from "@/features/auth/components/auth-link-confirmation";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Confirm email change — Huddle",
  robots: { index: false, follow: false },
};
export default function EmailChangeConfirmationPage() {
  return <AuthLinkConfirmation purpose="email_change" />;
}
