import type { Metadata } from "next";
import { Suspense } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = {
  title: {
    default: "ontariocamps.app — Find an available campsite in Ontario",
    template: "%s · ontariocamps.app",
  },
  description:
    "Search every campsite across Ontario Parks, Parks Canada, and Conservation Authorities in one place. Find availability, deep-link to booking.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <NuqsAdapter>
          <SiteHeader />
          <main className="flex-1 flex flex-col">
            <Suspense>
              <PageTransition>{children}</PageTransition>
            </Suspense>
          </main>
          <SiteFooter />
        </NuqsAdapter>
      </body>
    </html>
  );
}
