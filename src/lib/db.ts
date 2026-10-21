import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

let instance: DatabaseSync | undefined;
export function db() {
  if (instance) return instance;
  const path = process.env.DATABASE_PATH || "./data/radar.sqlite";
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(/*turbopackIgnore: true*/ path)), {
      recursive: true,
      mode: 0o700,
    });
  instance = new DatabaseSync(path);
  instance.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
  );
  instance.exec(
    "CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  for (const name of readdirSync(resolve("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (
      !instance.prepare("SELECT name FROM migrations WHERE name=?").get(name)
    ) {
      instance.exec("BEGIN IMMEDIATE");
      try {
        instance.exec(readFileSync(resolve("migrations", name), "utf8"));
        instance
          .prepare("INSERT INTO migrations VALUES (?,?)")
          .run(name, now());
        instance.exec("COMMIT");
      } catch (error) {
        instance.exec("ROLLBACK");
        throw error;
      }
    }
  }
  for (const p of permissions)
    instance.prepare("INSERT OR IGNORE INTO permissions VALUES (?)").run(p);
  return instance;
}
export const permissions = [
  "offers.view",
  "offers.manage",
  "offers.approve",
  "coupons.manage",
  "sellers.manage",
  "groups.manage",
  "posts.prepare",
  "posts.publish",
  "users.manage",
  "integrations.manage",
  "settings.manage",
  "audit.view",
] as const;
export type Permission = (typeof permissions)[number];
export type Row = Record<string, unknown>;
export const all = <T = Row>(sql: string, ...args: SQLInputValue[]) =>
  db()
    .prepare(sql)
    .all(...args) as T[];
export const one = <T = Row>(sql: string, ...args: SQLInputValue[]) =>
  db()
    .prepare(sql)
    .get(...args) as T | undefined;
export const run = (sql: string, ...args: SQLInputValue[]) =>
  db()
    .prepare(sql)
    .run(...args);
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
let transactionDepth = 0;
export function transaction<T>(fn: () => T): T {
  const depth = transactionDepth;
  const savepoint = `radar_sp_${depth}`;
  db().exec(depth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`);
  transactionDepth++;
  try {
    const value = fn();
    db().exec(depth === 0 ? "COMMIT" : `RELEASE SAVEPOINT ${savepoint}`);
    return value;
  } catch (e) {
    if (depth === 0) db().exec("ROLLBACK");
    else {
      db().exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      db().exec(`RELEASE SAVEPOINT ${savepoint}`);
    }
    throw e;
  } finally {
    transactionDepth--;
  }
}
export function audit(
  userId: string,
  action: string,
  entity: string,
  entityId: string | null,
  details: Row = {},
) {
  run(
    "INSERT INTO audit_logs VALUES (?,?,?,?,?,?,?)",
    id(),
    userId,
    action,
    entity,
    entityId,
    JSON.stringify(details),
    now(),
  );
}
