// What a school's own School Admin and Principal see about their School OS
// plan: trial days left, an invoice to pay, grace, or the paused page. Reads
// only this one school's rows, inside its own wall (withConsoleSchool).
import "server-only";

import { withConsoleSchool } from "../db";
import { formatDate, formatRupees } from "../format";
import { GRACE_DAYS, addDays, daysBetween, istDay } from "./billing";
import { supportPhone } from "./outbox";

export type OpenInvoice = { number: string; total: string; dueOn: string; payUrl: string | null; overdue: boolean };
export type PlanState = {
  status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  trialDaysLeft: number | null;
  keepUntil: string | null;
  invoices: OpenInvoice[];
  graceEnds: string | null;
  support: string | null;
};

export async function schoolPlanState(schoolId: string, now = new Date()): Promise<PlanState | null> {
  const today = istDay(now);
  return withConsoleSchool(schoolId, async (tx) => {
    const card = await tx.consoleSchool.findUnique({ where: { id: schoolId }, select: { status: true, trialEndsOn: true, keepUntil: true } });
    if (!card) return null;
    const open = await tx.platformInvoice.findMany({ where: { forSchoolId: schoolId, status: "UNPAID" }, orderBy: { dueOn: "asc" }, take: 5 });
    const late = open.find((i) => i.dueOn < today);
    return {
      status: card.status,
      trialDaysLeft: card.status === "TRIAL" && card.trialEndsOn ? Math.max(0, daysBetween(today, card.trialEndsOn)) : null,
      keepUntil: card.keepUntil ? formatDate(card.keepUntil) : null,
      invoices: open.map((i) => ({ number: i.number, total: formatRupees(i.totalPaise), dueOn: formatDate(i.dueOn), payUrl: i.razorpayLinkUrl, overdue: i.dueOn < today })),
      graceEnds: late ? formatDate(addDays(late.dueOn, GRACE_DAYS)) : null,
      support: supportPhone(),
    };
  });
}

/** The one-line banner for the School Admin and Principal, or null. */
export function planBanner(s: PlanState | null): { tone: "info" | "warn" | "problem"; text: string; payUrl: string | null } | null {
  if (!s) return null;
  const inv = s.invoices[0];
  if (s.graceEnds && inv) return { tone: "problem", text: `Invoice ${inv.number} (${inv.total}) is overdue. Pay by ${s.graceEnds} to keep School OS running.`, payUrl: inv.payUrl };
  if (s.status === "TRIAL" && s.trialDaysLeft !== null && s.trialDaysLeft <= 7) {
    const left = s.trialDaysLeft === 0 ? "Your free trial ends today." : `Your free trial ends in ${s.trialDaysLeft} day${s.trialDaysLeft === 1 ? "" : "s"}.`;
    return { tone: "warn", text: inv ? `${left} Pay invoice ${inv.number} (${inv.total}) to keep everything.` : `${left} Call DREAM TEAM${s.support ? ` on ${s.support}` : ""} to choose your plan.`, payUrl: inv?.payUrl ?? null };
  }
  if (inv) return { tone: "info", text: `Invoice ${inv.number} for ${inv.total} is due on ${inv.dueOn}.`, payUrl: inv.payUrl };
  return null;
}
