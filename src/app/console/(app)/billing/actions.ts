"use server";

// Plans & Billing actions (07-super-admin.md §8). Each checks the person's
// console role on the server and writes an Activity Log line.

import { approveTopup, applyGroupDiscount, cancelInvoice, changePlan, changePrices, invoiceFor, markFounding, markPaid, startSubscription, PLAN_KEYS, type PlanKey } from "@/lib/console/billing";
import { changeStatus, ConsoleProblem } from "@/lib/console/schools";
import { getCard } from "@/lib/console/schools";
import { deliveredWords } from "@/lib/console/outbox";
import { formatDate } from "@/lib/format";
import type { FormState } from "@/lib/forms";
import { consoleAct, str, uuid } from "../_lib/act";

const planOf = (fd: FormData): PlanKey => {
  const p = str(fd, "planKey");
  if (!PLAN_KEYS.includes(p as PlanKey)) throw new ConsoleProblem("Choose Essential or Complete.", "planKey");
  return p as PlanKey;
};
const studentsOf = (fd: FormData) => {
  const raw = str(fd, "students").replace(/[,\s]/g, "");
  if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new ConsoleProblem("Enter the number of students to bill, like 450.", "students");
  return Number(raw);
};
const sent = (d: { delivered: Parameters<typeof deliveredWords>[0]; link: string | null; problem: string | null }) => `${deliveredWords(d.delivered) ? ` ${deliveredWords(d.delivered)}` : ""}${d.link ? " Razorpay link included." : ""}${d.problem ? ` ${d.problem}` : ""}`;

/** A school's first plan: the subscription and its first invoice. */
export async function choosePlanAction(_p: FormState, fd: FormData) {
  return consoleAct("plan", fd, (c) => startSubscription(c.actor, uuid(fd, "schoolId"), { planKey: planOf(fd), hostel: str(fd, "hostel") === "on", buses: 0, students: studentsOf(fd), payIn: str(fd, "payIn") === "HALVES" ? "HALVES" : "YEARLY" }),
    (r) => `Plan saved. Invoice ${r.number} sent.${sent(r)}`);
}

/** Trial to Active: the first plan and invoice (if none yet), then Active. */
export async function activateAction(_p: FormState, fd: FormData) {
  return consoleAct("activate", fd, async (c) => {
    const schoolId = uuid(fd, "schoolId");
    const card = await getCard(schoolId);
    if (!card) throw new ConsoleProblem("This school was not found.");
    let number: string | null = null;
    if (str(fd, "hasPlan") !== "1") {
      if (!c.can("plan")) throw new ConsoleProblem("Your role cannot choose a plan. Ask the Owner or Onboarding.");
      number = (await startSubscription(c.actor, schoolId, { planKey: planOf(fd), hostel: str(fd, "hostel") === "on", buses: 0, students: studentsOf(fd), payIn: str(fd, "payIn") === "HALVES" ? "HALVES" : "YEARLY" })).number;
    }
    const reason = str(fd, "reason") || "The school chose its plan.";
    const r = await changeStatus(c.actor, schoolId, "activate", { reason });
    return { name: r.name, number };
  }, (r) => `${r.name} is Active.${r.number ? ` Invoice ${r.number} sent with its payment link.` : ""}`);
}

export async function changePlanAction(_p: FormState, fd: FormData) {
  return consoleAct("plan", fd, (c) => changePlan(c.actor, uuid(fd, "schoolId"), { planKey: planOf(fd), hostel: str(fd, "hostel") === "on" }), (r) =>
    r.kind === "up" ? `Plan changed from today. Invoice ${r.sent.number} sent.${sent(r.sent)}` : r.kind === "down" ? `Plan changes on ${formatDate(r.renewOn)}. Nothing changes before the renewal.` : "No change.");
}

export async function sendNewInvoiceAction(_p: FormState, fd: FormData) {
  const what = str(fd, "what");
  return consoleAct("invoice", fd, (c) => invoiceFor(c.actor, uuid(fd, "schoolId"), what === "credits" ? { kind: "CREDITS", credits: Number(str(fd, "pack")) } : { kind: "YEAR" }), (r) => `Invoice ${r.number} sent.${sent(r)}`);
}

export async function markPaidAction(_p: FormState, fd: FormData) {
  const raw = str(fd, "receivedOn");
  return consoleAct("markPaid", fd, (c) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new ConsoleProblem("Choose the date the money arrived.", "receivedOn");
    return markPaid(c.actor, uuid(fd, "invoiceId"), { via: str(fd, "via") === "CHEQUE" ? "CHEQUE" : "BANK", ref: str(fd, "ref"), receivedOn: new Date(`${raw}T00:00:00Z`) });
  }, (r) => `${r.number} marked paid.${r.reactivated ? " The school is Active again." : ""}`);
}

export async function cancelInvoiceAction(_p: FormState, fd: FormData) {
  return consoleAct("markPaid", fd, (c) => cancelInvoice(c.actor, uuid(fd, "invoiceId"), str(fd, "reason")), (r) => `${r.number} cancelled. The original is kept with your reason.`);
}

export async function approveTopupAction(_p: FormState, fd: FormData) {
  return consoleAct("approve", fd, (c) => approveTopup(c.actor, uuid(fd, "invoiceId")), (r) => `Top-up invoice ${r.number} sent.${sent(r)}`);
}

export async function foundingAction(_p: FormState, fd: FormData) {
  return consoleAct("discount", fd, (c) => markFounding(c.actor, uuid(fd, "schoolId")), () => "Marked as a founding school. The Essential price is locked for 3 years.");
}

export async function groupDiscountAction(_p: FormState, fd: FormData) {
  return consoleAct("discount", fd, (c) => applyGroupDiscount(c.actor, uuid(fd, "schoolId")), () => "Group discount saved. It applies from the next invoice.");
}

export async function changePricesAction(_p: FormState, fd: FormData) {
  const rupees = (k: string, label: string) => {
    const v = str(fd, k).replace(/[₹,\s]/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(v) || Number(v) <= 0) throw new ConsoleProblem(`${label} must be an amount like 120.`, k);
    return BigInt(Math.round(Number(v) * 100));
  };
  return consoleAct("prices", fd, (c) => {
    const from = str(fd, "validFrom");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new ConsoleProblem("Choose the day the new prices start.", "validFrom");
    return changePrices(c.actor, { essential: rupees("essential", "Essential price"), complete: rupees("complete", "Complete price"), hostel: rupees("hostel", "Hostel add-on price"), validFrom: new Date(`${from}T00:00:00Z`) });
  }, () => "New prices saved. Schools pay them from their next renewal.");
}
