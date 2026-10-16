// The visitor's address, for sign-in limits and the audit log.
//
// X-Forwarded-For is a list that each proxy appends to, so anything to the left
// of what our own proxies added was typed by the visitor and can be faked. We
// count TRUSTED_PROXY_HOPS proxies from the right and take the address the
// outermost of them saw. 0 means no proxy is in front of the app: the headers
// are ignored, because the visitor could set them to anything.
export function clientIp(get: (name: string) => string | null, hops = trustedHops()): string | null {
  if (hops <= 0) return null;
  const list = (get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length) return list[Math.max(0, list.length - hops)] ?? null;
  return get("x-real-ip")?.trim() || null;
}

function trustedHops() {
  const n = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}
