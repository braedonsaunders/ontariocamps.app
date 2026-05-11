/**
 * Single-process SQLite handle.
 *
 * This is the seam between dev and production. For Supabase migration:
 *   - Replace the better-sqlite3 import with `@supabase/supabase-js`
 *   - Replace `db().prepare(...).all(params)` calls with `supabase.from(...).select()`
 *   - The schema in schema.sql translates 1:1 to Postgres with two notes:
 *       (a) `lat REAL, lng REAL` becomes `location geography(point,4326)` and
 *           any `ST_DWithin(location, ST_MakePoint(?, ?)::geography, ?)` predicate
 *           replaces the in-app Haversine filter.
 *       (b) `INTEGER` booleans become `BOOLEAN`.
 *
 * In Next.js dev mode the module can be re-evaluated on hot reload; we cache
 * the connection on `globalThis` to avoid leaking file handles.
 */

import Database, { type Database as DB } from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DB_PATH = resolve(process.cwd(), "data", "ontariocamps.db");
const SCHEMA_PATH = resolve(process.cwd(), "lib", "db", "schema.sql");

type Cache = { __ocp_db?: DB };
const globalCache = globalThis as unknown as Cache;

export function db(): DB {
  if (globalCache.__ocp_db) return globalCache.__ocp_db;
  const handle = new Database(DB_PATH);
  // WAL mode for concurrent reads with the running ingest, NORMAL sync is the
  // standard tradeoff for app DBs (durability if the process crashes; not if
  // the kernel does — fine for dev).
  handle.pragma("journal_mode = WAL");
  handle.pragma("synchronous = NORMAL");
  handle.pragma("foreign_keys = ON");
  // Apply schema (idempotent — uses IF NOT EXISTS everywhere).
  handle.exec(readFileSync(SCHEMA_PATH, "utf8"));
  globalCache.__ocp_db = handle;
  return handle;
}

/** True when a populated DB file exists. Used to decide whether to fall back
 *  to mock data on a clean checkout. */
export function dbHasData(): boolean {
  if (!existsSync(DB_PATH)) return false;
  try {
    const handle = db();
    const row = handle.prepare("SELECT count(*) AS n FROM operators").get() as { n: number } | undefined;
    return (row?.n ?? 0) > 0;
  } catch {
    return false;
  }
}
