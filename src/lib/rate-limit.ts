// Limits against abuse (08-platform-security.md §7): each person, device or
// key gets a fair number of requests per time window, so one bad script
// cannot slow down every school. Counted in the database, so the limit holds
// across every server.
import { prisma } from "./db";

export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Counts one hit for `key` and says whether it is within `max` hits per
 * `windowSeconds`. Keys look like "sign-in:ip:1.2.3.4" or "otp:guardian:<id>".
 */
export async function hitLimit(key: string, max: number, windowSeconds: number, now = new Date()): Promise<LimitResult> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  // Kept in UTC like every other time: a Date goes to the database as a moment,
  // which a "timestamp" column would otherwise read in the session's time zone.
  const rows = await prisma.$queryRaw<{ hits: number }[]>`
    INSERT INTO rate_limit_bucket (key, window_start, hits) VALUES (${key}, (${windowStart}::timestamptz AT TIME ZONE 'UTC'), 1)
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN rate_limit_bucket.window_start = EXCLUDED.window_start THEN rate_limit_bucket.hits + 1 ELSE 1 END,
      window_start = EXCLUDED.window_start
    RETURNING hits`;
  const hits = Number(rows[0]?.hits ?? 1);
  if (hits <= max) return { ok: true };
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000)) };
}

/** Plain words for a person who hit a limit. */
export function limitMessage(r: { retryAfterSeconds: number }) {
  const mins = Math.ceil(r.retryAfterSeconds / 60);
  return r.retryAfterSeconds < 90
    ? `Too many tries in a short time. Please wait ${r.retryAfterSeconds} seconds and try again.`
    : `Too many tries in a short time. Please wait ${mins} minutes and try again.`;
}

/** Clears windows older than a day. Run by a schedule. */
export async function pruneRateLimits() {
  await prisma.$executeRaw`SELECT prune_rate_limits()`;
}
