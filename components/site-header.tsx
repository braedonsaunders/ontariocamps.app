import Link from "next/link";
import { Tent } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-stone-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-forest-700 text-white">
            <Tent size={18} strokeWidth={2.25} />
          </span>
          <span className="font-semibold tracking-tight text-stone-900 group-hover:text-forest-700 transition-colors">
            ontariocamps<span className="text-forest-600">.app</span>
          </span>
        </Link>
        <nav className="hidden sm:flex items-center gap-1 text-sm text-stone-700">
          <Link href="/search" className="px-3 py-1.5 rounded-md hover:bg-stone-100">Search</Link>
          <Link href="/operators" className="px-3 py-1.5 rounded-md hover:bg-stone-100">Operators</Link>
          <Link href="/analytics" className="px-3 py-1.5 rounded-md hover:bg-stone-100">Analytics</Link>
          <Link href="/freshness" className="px-3 py-1.5 rounded-md hover:bg-stone-100">Data freshness</Link>
        </nav>
        <Link href="/search" className="btn-primary text-xs">Find a campsite</Link>
      </div>
    </header>
  );
}
