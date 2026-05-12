import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: "What ontariocamps.app is, and what it isn't.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 prose prose-stone">
      <h1>About ontariocamps.app</h1>
      <p className="lead text-lg text-stone-700">
        A unified search engine for campsite availability across Ontario&apos;s three major operators:
        Ontario Parks, Parks Canada, and the province&apos;s Conservation Authorities.
      </p>
      <h2>What we do</h2>
      <ul>
        <li>Index availability across every Ontario operator, in near-real-time.</li>
        <li>Let you ask questions the operator sites can&apos;t — geo radius, flexible-date windows, cross-operator.</li>
        <li>Send you directly to the operator&apos;s own booking page when you find what you want.</li>
      </ul>
      <h2>What we don&apos;t do</h2>
      <ul>
        <li>We don&apos;t handle bookings, payments, or user accounts.</li>
        <li>We don&apos;t store any reservation data on your behalf.</li>
        <li>We don&apos;t scrape during reservation-opening windows or other peak operator times.</li>
      </ul>
      <h2>Honest about freshness</h2>
      <p>
        Every result card shows when we last checked that site. The refresh system prioritizes near-term
        and bookable inventory, while far-future or closed inventory refreshes more slowly. See the{" "}
        <Link href="/data">data freshness page</Link> for live numbers.
      </p>
      <h2>Affiliation</h2>
      <p>
        ontariocamps.app is an independent project. It is not affiliated with Ontario Parks, Parks Canada,
        Camis Inc., or any Conservation Authority. All trademarks are property of their respective owners.
      </p>
      <h2>Source</h2>
      <p>
        The technical spec for this project lives at{" "}
        <a href="https://github.com/braedonsaunders/ontariocamps.app">
          github.com/braedonsaunders/ontariocamps.app
        </a>
        . PRs and corrections welcome.
      </p>
    </div>
  );
}
