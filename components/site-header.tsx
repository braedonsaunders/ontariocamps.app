"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tent, Github } from "lucide-react";
import { motion } from "motion/react";

const REPO_URL = "https://github.com/braedonsaunders/ontariocamps.app";

const NAV = [
  { href: "/search", label: "Search" },
  { href: "/operators", label: "Operators" },
  { href: "/analytics", label: "Analytics" },
  { href: "/freshness", label: "Data freshness" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-stone-200">
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
        <nav className="hidden sm:flex items-center gap-1 text-sm text-stone-700">
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
            className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
            title="Source on GitHub"
          >
            <Github size={16} />
          </a>
          <Link href="/search" className="btn-primary text-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            Find a campsite
          </Link>
        </div>
      </div>
    </header>
  );
}
