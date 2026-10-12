"use server";

// Parent Link: pages a child's attendance calendar to another month. No login,
// so the link is found from its token again and this phone must be one the
// guardian confirmed; the child must be the guardian's own. Rate-limited.
import { cookies } from "next/headers";
import { withSchool } from "../db";
import { deviceInfo } from "../current";
import { hitLimit } from "../rate-limit";
import { confirmedDevice, deviceCookieName, findLink } from "../parent-link/links";
import { todayIn } from "../staff/dates";
import { parseMonth, studentCalendar } from "./calendar-months";

const GONE = "This link is no longer active. Please ask the school for a new one.";

export async function parentMonthAction(token: string, studentId: string, month: string) {
  const m = parseMonth(month);
  if (!m) return { error: "Choose a month." };
  const found = await findLink(token);
  if (!found) return { error: GONE };
  const device = await deviceInfo();
  const limited = await hitLimit(`pl-cal:ip:${device.ipAddress ?? "unknown"}`, 120, 600);
  if (!limited.ok) return { error: "Too many requests. Please wait a minute and try again." };
  const key = (await cookies()).get(deviceCookieName(found.linkId))?.value ?? null;
  const ctx = { schoolId: found.schoolId, userId: null };
  return withSchool(ctx, async (tx) => {
    const ok = await confirmedDevice(tx, found.linkId, key);
    if (!ok) return { error: "Please confirm this phone again to see attendance." };
    const mine = await tx.studentGuardian.findFirst({ where: { guardianId: ok.link.guardianId, studentId }, select: { id: true } });
    if (!mine) return { error: "This child is not on your link." };
    const school = await tx.school.findUnique({ where: { id: found.schoolId }, select: { timeZone: true } });
    const data = await studentCalendar(tx, ctx, studentId, m, todayIn(school?.timeZone ?? "Asia/Kolkata"), { allYears: true });
    return { view: data.view };
  });
}
