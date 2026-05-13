import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-stone-200 bg-white">
      <nav className="mx-auto max-w-7xl px-4 py-2.5 text-xs text-stone-600 sm:hidden" aria-label="Footer">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="mr-1 font-semibold text-stone-900">ontariocamps.app</span>
          <Link href="/parks" className="hover:text-forest-700">Parks</Link>
          <Link href="/operator/ontario_parks" className="hover:text-forest-700">Ontario Parks</Link>
          <Link href="/operator/parks_canada" className="hover:text-forest-700">Parks Canada</Link>
          <Link href="/data" className="hover:text-forest-700">Data</Link>
          <Link href="/about" className="hover:text-forest-700">About</Link>
          <a href="https://github.com/braedonsaunders/ontariocamps.app" className="hover:text-forest-700">GitHub</a>
        </div>
      </nav>
      <div className="mx-auto hidden max-w-7xl gap-6 px-6 py-8 text-sm text-stone-600 sm:grid sm:grid-cols-3 lg:px-8">
        <div>
          <div className="mb-2 font-semibold text-stone-900">ontariocamps.app</div>
          <p className="leading-relaxed">
            A unified availability search across Ontario Parks, Parks Canada, and Ontario Conservation Authorities.
            We index — operators handle the booking.
          </p>
        </div>
        <div>
          <div className="mb-2 font-semibold text-stone-900">Parks</div>
          <ul className="space-y-1">
            <li><Link href="/parks" className="hover:text-forest-700">All parks &amp; networks</Link></li>
            <li><Link href="/operator/ontario_parks" className="hover:text-forest-700">Ontario Parks</Link></li>
            <li><Link href="/operator/parks_canada" className="hover:text-forest-700">Parks Canada (Ontario)</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-2 font-semibold text-stone-900">Project</div>
          <ul className="space-y-1">
            <li><Link href="/about" className="hover:text-forest-700">About</Link></li>
            <li><Link href="/data" className="hover:text-forest-700">Data freshness</Link></li>
            <li><a href="https://github.com/braedonsaunders/ontariocamps.app" className="hover:text-forest-700">Source on GitHub</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-stone-100 px-4 py-1.5 text-center text-[10px] leading-tight text-stone-500 sm:py-4 sm:text-xs">
        <span className="sm:hidden">Independent. Bookings happen on operator sites.</span>
        <span className="hidden sm:inline">
          Not affiliated with Ontario Parks, Parks Canada, or any Conservation Authority. All bookings happen on the operator&apos;s own site.
        </span>
      </div>
    </footer>
  );
}
