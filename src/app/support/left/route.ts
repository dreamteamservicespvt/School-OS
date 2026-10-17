// Where a support browser goes once its access is over (the time given ran out,
// the school or DREAM TEAM ended it, or the console signed out): the support
// cookie is cleared and the person is back in the console.
import { NextResponse } from "next/server";
import { consoleSupportUrl, withoutSupportCookie } from "../support-cookie";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withoutSupportCookie(NextResponse.redirect(consoleSupportUrl(req, "?entry=over"), 303));
}
