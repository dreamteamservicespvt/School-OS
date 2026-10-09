// The address School OS is reached at, for webhook addresses and links in
// emails. APP_URL wins (set it in production); otherwise the request's host.
import "server-only";

import { headers } from "next/headers";

export async function appOrigin(): Promise<string> {
  const fixed = process.env.APP_URL?.replace(/\/+$/, "");
  if (fixed) return fixed;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export function webhookAddress(origin: string, provider: string, schoolId: string, gatewayId: string) {
  return `${origin}/api/v1/payments/${provider}/webhook?s=${schoolId}&g=${gatewayId}`;
}
