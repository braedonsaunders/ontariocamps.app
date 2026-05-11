/**
 * Postgres client (Supabase production, postgres-js).
 *
 * Two connection strings are recognised:
 *   - DATABASE_URL          → pooled transaction mode (port 6543), used by the
 *                             app for runtime queries; serverless-friendly.
 *   - DATABASE_DIRECT_URL   → pooled session mode (port 5432), used by the
 *                             ingest scripts where long transactions and
 *                             prepared statements matter.
 *
 * Production wire-up: both env vars come from Supabase's "Project Settings →
 * Database → Connection string". Set them in Vercel's project env panel.
 */

import postgres from "postgres";

const globalAny = globalThis as unknown as {
  __ocp_pg?: ReturnType<typeof postgres>;
  __ocp_pg_direct?: ReturnType<typeof postgres>;
};

/** Pooled transaction-mode connection (port 6543). Use for ad-hoc reads.
 *  Prepared statements are disabled because PgBouncer transaction mode
 *  doesn't preserve session state across statements. */
export function sql() {
  if (globalAny.__ocp_pg) return globalAny.__ocp_pg;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. " +
        "Set it to the Supabase pooler (transaction mode, port 6543) URL.",
    );
  }
  globalAny.__ocp_pg = postgres(url, {
    ssl: "require",
    prepare: false,           // PgBouncer transaction-mode incompatible with prepares
    max: 8,                   // serverless-friendly; bumped up for SSR pages
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return globalAny.__ocp_pg;
}

/** Session-mode connection (port 5432). Use from ingest scripts. */
export function sqlDirect() {
  if (globalAny.__ocp_pg_direct) return globalAny.__ocp_pg_direct;
  const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_DIRECT_URL is not set. " +
        "Set it to the Supabase pooler (session mode, port 5432) URL for ingest.",
    );
  }
  globalAny.__ocp_pg_direct = postgres(url, {
    ssl: "require",
    prepare: true,
    max: 4,
    idle_timeout: 30,
    connect_timeout: 10,
  });
  return globalAny.__ocp_pg_direct;
}

/** True when the DB exists and has at least one operator row. */
export async function dbHasData(): Promise<boolean> {
  try {
    const rows = await sql()`SELECT count(*)::int AS n FROM operators`;
    return rows[0]?.n > 0;
  } catch {
    return false;
  }
}
