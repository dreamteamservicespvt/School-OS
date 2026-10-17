"use server";

// The Pay button on Parent Link (no login). Finds the link from the token
// again, checks again on the server that the link, Parent Link, the phone and
// the Fees switch are on (guardianAccess) and that the child is one the
// guardian may pay for, is rate-limited, and sends the parent to the Razorpay
// payment page for the chosen rows. Nothing is posted here: a payment posts
// only when the gateway confirms it (A8).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { ACCESS_WORDS, deviceCookieName, findLink, guardianAccess } from "@/lib/parent-link/links";
import { startParentLinkPayment } from "@/lib/fees/parent-link";
import { MoneyProblem } from "@/lib/fees/problem";

export type PayState = { ok: false; message: string } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function payFees(token: string, _prev: PayState, form: FormData): Promise<PayState> {
  const studentId = String(form.get("studentId") ?? "");
  const dueIds = form.getAll("dueId").map(String).filter((x) => UUID.test(x));
  if (!UUID.test(studentId)) return { ok: false, message: "Choose your child first." };
  if (!dueIds.length) return { ok: false, message: "Tick at least one fee to pay." };
  const found = await findLink(token);
  if (!found) return { ok: false, message: ACCESS_WORDS.gone };
  const device = await deviceInfo();
  const limited = await hitLimit(`pl-pay:link:${found.linkId}`, 20, 3600);
  if (!limited.ok) return { ok: false, message: limitMessage(limited) };
  const ipLimited = await hitLimit(`pl-pay:ip:${device.ipAddress ?? "unknown"}`, 40, 3600);
  if (!ipLimited.ok) return { ok: false, message: limitMessage(ipLimited) };
  const key = (await cookies()).get(deviceCookieName(found.linkId))?.value ?? null;
  const g = await guardianAccess(found, key, "fees");
  if (!g.ok) return { ok: false, message: g.message };
  let path: string;
  try {
    path = await withSchool(g.ctx, async (tx) => (await startParentLinkPayment(tx, g.ctx, g.guardianId, studentId, dueIds)).payPath);
  } catch (e) {
    if (e instanceof MoneyProblem) return { ok: false, message: e.message.includes("Payment Gateways") ? "Online payment is not available right now. Please pay at the school office." : e.message };
    throw e;
  }
  redirect(path);
}
