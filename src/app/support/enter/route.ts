// A DREAM TEAM support person opens the school (07-super-admin.md §3.4, step 4).
// The console sends them here, on the school's own address, with a one-time
// ticket that works for one minute. It becomes the support browser's cookie
// until the time the school gave; then they land on the school's Dashboard.
import { NextResponse } from "next/server";
import { claimSupportTicket } from "@/lib/console/support";
import { consoleSupportUrl, withSupportCookie, withoutSupportCookie } from "../support-cookie";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ticket = new URL(req.url).searchParams.get("ticket");
  const claimed = await claimSupportTicket(ticket);
  if (!claimed) return withoutSupportCookie(NextResponse.redirect(consoleSupportUrl(req, "?entry=expired"), 303));
  return withSupportCookie(NextResponse.redirect(new URL("/dashboard", req.url), 303), claimed.token, claimed.endsAt);
}
