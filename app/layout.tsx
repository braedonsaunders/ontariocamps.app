import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { Suspense } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PageTransition } from "@/components/page-transition";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: "ontariocamps.app | Find an available campsite in Ontario",
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "en_CA",
    siteName: SITE_NAME,
    url: absoluteUrl("/"),
    title: "ontariocamps.app | Find an available campsite in Ontario",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: "ontariocamps.app | Find an available campsite in Ontario",
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  potentialAction: {
    "@type": "SearchAction",
    target: `${absoluteUrl("/search")}?loc={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd).replace(/</g, "\\u003c") }}
        />
        <NuqsAdapter>
          <SiteHeader />
          <main className="flex-1 flex flex-col">
            <Suspense>
              <PageTransition>{children}</PageTransition>
            </Suspense>
          </main>
          <SiteFooter />
        </NuqsAdapter>
        <Analytics />
      </body>
    </html>
  );
}
