"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Tent, Github, Menu, X } from "lucide-react";
import { motion } from "motion/react";

const REPO_URL = "https://github.com/braedonsaunders/ontariocamps.app";

const NAV = [
  { href: "/search", label: "Search" },
  { href: "/map", label: "Map" },
  { href: "/parks", label: "Parks" },
  { href: "/analytics", label: "Analytics" },
  { href: "/data", label: "Data" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-stone-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <motion.span
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-forest-700 text-white"
            whileHover={{ rotate: -8, scale: 1.06 }}
            transition={{ type: "spring", stiffness: 380, damping: 18 }}
          >
            <Tent size={18} strokeWidth={2.25} />
          </motion.span>
          <span className="font-semibold tracking-tight text-stone-900 group-hover:text-forest-700 transition-colors">
            ontariocamps<span className="text-forest-600">.app</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 text-sm text-stone-700">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-3 py-1.5 rounded-md transition-colors ${
                  active ? "text-forest-700" : "hover:bg-stone-100"
                }`}
              >
                {item.label}
                {active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-forest-600"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Source on GitHub"
            className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
            title="Source on GitHub"
          >
            <Github size={16} />
          </a>
          <Link href="/search" className="hidden md:inline-flex btn-primary text-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            Find a campsite
          </Link>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-stone-700 ring-1 ring-stone-200 transition-colors hover:bg-stone-100 md:hidden"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-menu"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={19} />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <motion.div
          id="mobile-nav-menu"
          className="border-t border-stone-200 bg-white md:hidden"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mx-auto max-w-7xl px-4 py-3">
            <Link
              href="/search"
              className="btn-primary h-10 w-full text-sm"
            >
              Find a campsite
            </Link>
            <nav className="mt-3 grid grid-cols-2 gap-2 text-sm" aria-label="Mobile navigation">
              {NAV.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex h-10 items-center justify-center rounded-md px-3 font-medium ring-1 transition-colors ${
                      active
                        ? "bg-forest-50 text-forest-800 ring-forest-200"
                        : "bg-white text-stone-700 ring-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md text-sm font-medium text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
            >
              <Github size={15} />
              Source on GitHub
            </a>
          </div>
        </motion.div>
      )}
    </header>
  );
}
