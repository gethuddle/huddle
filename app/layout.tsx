import type { Metadata } from "next";
import { Familjen_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

import "./globals.css";

const familjenGrotesk = Familjen_Grotesk({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-familjen-grotesk",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Huddle — Match day, together",
  description:
    "Huddle is building a safer way for sports fans in Israel to discover and join nearby watch events.",
  icons: {
    icon: "/brand/huddle-favicon.svg",
    apple: "/brand/huddle-app-icon.svg",
  },
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html className={familjenGrotesk.variable} lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
