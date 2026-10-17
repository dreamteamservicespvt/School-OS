// The support browser's cookie and where it goes when support access ends
// (07-super-admin.md §3.4). Shared by /support/enter, /support/end and /support/left.
import "server-only";

import { NextResponse } from "next/server";
import { SUPPORT_COOKIE } from "@/lib/support-paths";

/** The console's Support Access page: on the console's own address when it has one (CONSOLE_HOST). */
export function consoleSupportUrl(req: Request, query = "") {
  const here = new URL(req.url);
  const host = process.env.CONSOLE_HOST?.trim();
  const base = host ? `${here.protocol}//${host}` : here.origin;
  return `${base}/console/support${query}`;
}

export function withSupportCookie(res: NextResponse, token: string, endsAt: Date) {
  res.cookies.set(SUPPORT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: endsAt,
  });
  return res;
}

export function withoutSupportCookie(res: NextResponse) {
  res.cookies.set(SUPPORT_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
