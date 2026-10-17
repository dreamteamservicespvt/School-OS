// "End now" on the support bar (07-super-admin.md §3.4, step 5): the DREAM TEAM
// person ends their own access early. Written in the school's Audit Log and the
// console's Activity Log; the browser goes back to the console.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { endSupportByToken } from "@/lib/console/support-entry";
import { SUPPORT_COOKIE } from "@/lib/support-paths";
import { consoleSupportUrl, withoutSupportCookie } from "../support-cookie";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = (await cookies()).get(SUPPORT_COOKIE)?.value;
  const ended = await endSupportByToken(token);
  return withoutSupportCookie(NextResponse.redirect(consoleSupportUrl(req, ended ? "?entry=ended" : "?entry=over"), 303));
}
