// The proxy's mark on a DREAM TEAM support request it checked (security audit
// run-1). The look-only rule for support browsers is applied in src/proxy.ts,
// which runs only when its matcher sees the support cookie. So that a request
// the proxy did not see (a cookie the matcher reads differently from the app)
// can never act as support, the proxy adds this header with a value only the
// server can make, and src/lib/current.ts refuses a support session without it.
// A browser cannot make the value: it is derived from the server's own key.
// No "server-only" here: src/proxy.ts imports it (the proxy runs on Node.js).
import { createHmac, timingSafeEqual } from "node:crypto";

export const SUPPORT_CHECKED_HEADER = "x-school-os-support-checked";

/** The value the proxy adds; null when the server has no key (then support never opens). */
export function supportStamp(): string | null {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) return null;
  return createHmac("sha256", key).update("school-os support request checked by the proxy").digest("hex");
}

/** Whether a request carries the proxy's mark. */
export function supportStampOk(value: string | null | undefined): boolean {
  const want = supportStamp();
  if (!want || !value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
