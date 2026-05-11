import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 grid gap-6 sm:grid-cols-3 text-sm text-stone-600">
        <div>
          <div className="font-semibold text-stone-900 mb-2">ontariocamps.app</div>
          <p className="leading-relaxed">
            A unified availability search across Ontario Parks, Parks Canada, and Ontario Conservation Authorities.
            We index — operators handle the booking.
          </p>
        </div>
        <div>
          <div className="font-semibold text-stone-900 mb-2">Parks</div>
          <ul className="space-y-1">
            <li><Link href="/parks" className="hover:text-forest-700">All parks &amp; networks</Link></li>
            <li><Link href="/operator/ontario_parks" className="hover:text-forest-700">Ontario Parks</Link></li>
            <li><Link href="/operator/parks_canada" className="hover:text-forest-700">Parks Canada (Ontario)</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-stone-900 mb-2">Project</div>
          <ul className="space-y-1">
            <li><Link href="/about" className="hover:text-forest-700">About</Link></li>
            <li><Link href="/freshness" className="hover:text-forest-700">Data freshness</Link></li>
            <li><a href="https://github.com/braedonsaunders/ontariocamps.app" className="hover:text-forest-700">Source on GitHub</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-stone-100 py-4 text-xs text-stone-500 text-center">
        Not affiliated with Ontario Parks, Parks Canada, or any Conservation Authority. All bookings happen on the operator&apos;s own site.
      </div>
    </footer>
  );
}
