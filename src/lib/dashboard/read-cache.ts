// One Dashboard transaction reads the same records many times: the school's
// attendance settings, its calendar, the campuses and years, the sections.
// Each widget asks through helpers of its own module, so the same query went
// to the database again and again (layman loop 15 Nov: 99 of a Principal's
// 368 queries were exact repeats in one transaction). `cachedReads` hands the
// widgets the same transaction, but an identical read in it is asked once.
//
// - Only model reads are kept (findMany, findFirst, findUnique, count,
//   aggregate, groupBy and their OrThrow forms), by model, method and the exact
//   arguments. Raw SQL always goes to the database.
// - Any write in the transaction (a model write, $executeRaw, raw SQL that is
//   not a plain SELECT) forgets everything kept, so a read after it sees it.
// - Each caller gets its own copy of the rows, so one widget sorting or
//   changing what it got never changes what the next one gets.
// - It lives and dies with one transaction (like `memo`): row-level security
//   and the school are those of the transaction that made the read.
import "server-only";

import type { Tx } from "../db";

const READS = new Set(["findMany", "findFirst", "findUnique", "findFirstOrThrow", "findUniqueOrThrow", "count", "aggregate", "groupBy"]);

/** A key for the read's arguments, or null when they hold something whose value JSON cannot tell apart (then it is not kept). */
export function argsKey(args: unknown): string | null {
  let plain = true;
  const key = JSON.stringify(args ?? null, function (this: Record<string, unknown>, k, v) {
    const raw = this[k];
    if (raw instanceof Date) return { $date: raw.getTime() };
    if (typeof v === "bigint") return { $big: v.toString() };
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const proto = Object.getPrototypeOf(raw);
      if (proto !== Object.prototype && proto !== null) plain = false;
    }
    return v;
  });
  return plain ? key : null;
}

/** A copy of what a read returned: arrays and plain objects copied all the way down, dates copied, everything else (Decimal) as it is. */
export function copyRows<T>(v: T): T {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(copyRows) as T;
  if (v instanceof Date) return new Date(v.getTime()) as T;
  if (v instanceof Uint8Array) return (Buffer.isBuffer(v) ? Buffer.from(v) : v.slice()) as T;
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return v;
  const out: Record<string, unknown> = proto === null ? Object.create(null) : {};
  for (const k of Object.keys(v)) out[k] = copyRows((v as Record<string, unknown>)[k]);
  return out as T;
}

/** Raw SQL that only reads (a SELECT or WITH ... SELECT with no write in it) keeps what was read. */
function readOnlySql(args: unknown[]): boolean {
  const first = args[0] as unknown;
  const text = typeof first === "string" ? first
    : Array.isArray(first) ? first.join("?")
      : first && typeof first === "object" ? String((first as { sql?: unknown; strings?: unknown[] }).sql ?? (first as { strings?: unknown[] }).strings?.join("?") ?? "")
        : "";
  return /^\s*\(?\s*(select|with)\b/i.test(text) && !/\b(insert|update|delete|merge|truncate|set_config|nextval|setval)\b|\bfor\s+(update|share|no\s+key|key)\b/i.test(text);
}

type Fn = (...a: unknown[]) => unknown;

/** The same transaction, with identical model reads asked once (see the top of this file). */
export function cachedReads(tx: Tx): Tx {
  const kept = new Map<string, Promise<unknown>>();
  const delegates = new Map<string, unknown>();
  const forget = () => kept.clear();
  return new Proxy(tx, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof prop !== "string") return value;
      if (prop.startsWith("$")) {
        if (typeof value !== "function") return value;
        const fn = value as Fn;
        if (prop === "$queryRaw" || prop === "$queryRawUnsafe") return (...a: unknown[]) => { if (!readOnlySql(a)) forget(); return fn.apply(target, a); };
        return (...a: unknown[]) => { forget(); return fn.apply(target, a); };
      }
      if (!value || (typeof value !== "object" && typeof value !== "function")) return value;
      const had = delegates.get(prop);
      if (had) return had;
      const model = prop;
      const delegate = new Proxy(value as object, {
        get(dt, method) {
          const m = Reflect.get(dt, method, dt) as unknown;
          if (typeof m !== "function" || typeof method !== "string") return m;
          const fn = m as Fn;
          if (!READS.has(method)) return (...a: unknown[]) => { forget(); return fn.apply(dt, a); };
          return (...a: unknown[]) => {
            const k = a.length <= 1 ? argsKey(a[0]) : null;
            if (k === null) return fn.apply(dt, a);
            const key = `${model}.${method}:${k}`;
            let p = kept.get(key);
            if (!p) {
              p = Promise.resolve(fn.apply(dt, a));
              // Whoever awaits it still gets the error; a read nobody awaits must not crash the server.
              p.catch(() => {});
              kept.set(key, p);
            }
            return p.then(copyRows);
          };
        },
      });
      delegates.set(prop, delegate);
      return delegate;
    },
  });
}
