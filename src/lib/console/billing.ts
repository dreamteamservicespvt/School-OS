// Plans & Billing (07-super-admin.md §3.5; prices and rules from
// school-os/pricing/pricing.md, which wins where they differ).
//
// - Essential ₹120 and Complete ₹200 per student a year; at least 100 students;
//   students above 1,000 at half price. Hostel ₹10,000 a school. Prices exclude 18% GST.
// - Group discount: 10% for 3 to 4 schools, 15% for 5 or more.
// - Founding schools: the first 20 that pay; Essential price locked for 3 years.
// - Paid yearly or in two halves six months apart.
// - Upgrade any time, paying the difference for the rest of the year; downgrade at renewal.
// - Invoices are never deleted; a wrong one is cancelled with a reason.
// - Paying reactivates a Suspended school at once.
// Money is whole paise (BigInt) everywhere.
import "server-only";

import { Prisma, type Plan, type PlatformInvoice, type Subscription } from "@prisma/client";
import { withConsole, withConsoleSchool, type Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { cancelPaymentLink, createPaymentLink, platformRazorpay, RazorpayProblem } from "../payments/razorpay";
import { logActivity, SYSTEM_ACTOR, tenDigits, type ConsoleActor } from "./activity";
import { deliver, type ConsoleOutgoing, type Delivered } from "./outbox";
import { schoolAdmins } from "./measure";
import { notifyTeam } from "./notify";
import { ConsoleProblem, STATUS_LABEL, changeStatus, getCard } from "./schools";

export const PLAN_KEYS = ["essential", "complete"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];
export const PLAN_LABEL: Record<string, string> = { essential: "Essential", complete: "Complete", hostel: "Hostel", transport: "Transport" };
export const GST_PERCENT = 18;
export const GRACE_DAYS = 15;
export const FOUNDING_LIMIT = 20;
export const FOUNDING_YEARS = 3;
export const REMINDER_DAYS = [30, 15, 7, 1] as const;
/** Days a new invoice gives the school to pay (inferred). */
export const PAY_WITHIN_DAYS = 14;
/** Message credit packs from the pricing: ₹0.25 a credit, from ₹1,000 (4,000 credits). */
export const CREDIT_PACKS = [
  { credits: 4000, paise: 100_000n },
  { credits: 8000, paise: 200_000n },
  { credits: 20000, paise: 500_000n },
] as const;
export const INVOICE_KIND_LABEL: Record<string, string> = { NEW: "First year", RENEWAL: "Renewal", UPGRADE: "Plan change", TOPUP: "Top-up", SECOND_HALF: "Second half", CREDITS: "Message credits" };
export const SUB_STATUS_LABEL = { PAID: "Paid", DUE: "Due", GRACE: "In grace", OVERDUE: "Overdue" } as const;

export const groupDiscountFor = (schools: number) => (schools >= 5 ? 15 : schools >= 3 ? 10 : 0);

// ---------------------------------------------------------------------------
// Dates (Asia/Kolkata calendar days, stored as UTC midnight)
// ---------------------------------------------------------------------------

export function istDay(now = new Date()): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(`${s}T00:00:00Z`);
}
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
export function addMonths(d: Date, n: number) {
  const x = new Date(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return x;
}
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);
/** Whole months from today to the renewal, at least 1. */
export function monthsLeft(today: Date, renewOn: Date) {
  const m = (renewOn.getUTCFullYear() - today.getUTCFullYear()) * 12 + (renewOn.getUTCMonth() - today.getUTCMonth());
  return Math.min(12, Math.max(1, m));
}
/** "26-27" for a date in the financial year April 2026 to March 2027. */
export function fyShort(d: Date) {
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${String(y % 100).padStart(2, "0")}-${String((y + 1) % 100).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

/** The price list valid on a day: each plan and add-on's latest row from on or before it. */
export async function priceList(tx: Tx, on: Date): Promise<Record<string, Plan>> {
  const rows = await tx.plan.findMany({ where: { validFrom: { lte: on } }, orderBy: { validFrom: "desc" } });
  const out: Record<string, Plan> = {};
  for (const r of rows) out[r.key] ??= r;
  return out;
}

/** Every version of the price list, newest first, for the Price list card. */
export async function priceHistory() {
  return withConsole((tx) => tx.plan.findMany({ orderBy: [{ validFrom: "desc" }, { key: "asc" }] }));
}

/** A plan's price for a year: at least the minimum students, half price above 1,000. */
export function planYearly(plan: Pick<Plan, "pricePaise" | "minStudents" | "priceAbove1000Paise">, students: number, pricePerStudent?: bigint) {
  const per = pricePerStudent ?? plan.pricePaise;
  const above = pricePerStudent ? pricePerStudent / 2n : plan.priceAbove1000Paise ?? plan.pricePaise / 2n;
  const n = Math.max(students, plan.minStudents);
  return BigInt(Math.min(n, 1000)) * per + BigInt(Math.max(0, n - 1000)) * above;
}

export type Line = { label: string; qty: number; ratePaise: bigint; amountPaise: bigint };
export type Quote = { items: Line[]; subtotal: bigint; discount: bigint; taxable: bigint; gst: bigint; total: bigint };

export const gstOn = (p: bigint) => (p * BigInt(GST_PERCENT) + 50n) / 100n;

export function finish(items: Line[], discountPercent = 0, discountWords = ""): Quote {
  const subtotal = items.reduce((s, l) => s + l.amountPaise, 0n);
  const discount = discountPercent > 0 ? (subtotal * BigInt(discountPercent) + 50n) / 100n : 0n;
  const lines = discount > 0n ? [...items, { label: discountWords || `Discount ${discountPercent}%`, qty: 1, ratePaise: -discount, amountPaise: -discount }] : items;
  const taxable = subtotal - discount;
  const gst = gstOn(taxable);
  return { items: lines, subtotal, discount, taxable, gst, total: taxable + gst };
}

/** A year (or a part of it) of a plan, its add-ons and any discount. */
export function quoteYear(list: Record<string, Plan>, input: { planKey: string; students: number; hostel: boolean; buses?: number; discountPercent: number; discountReason: string | null; founding?: boolean; pricePerStudent?: bigint; fraction?: { num: number; den: number }; label?: string }): Quote {
  const plan = list[input.founding ? "essential" : input.planKey];
  if (!plan) throw new ConsoleProblem("The price list has no price for this plan.");
  const per = input.pricePerStudent ?? plan.pricePaise;
  const f = input.fraction ?? { num: 1, den: 1 };
  const part = (p: bigint) => (p * BigInt(f.num) + BigInt(f.den) / 2n) / BigInt(f.den);
  const n = Math.max(input.students, plan.minStudents);
  const items: Line[] = [{
    label: `${input.label ? `${input.label}: ` : ""}${PLAN_LABEL[input.planKey]}${input.founding && input.planKey !== "essential" ? " (founding price)" : ""}, ${n.toLocaleString("en-IN")} students${input.students < plan.minStudents ? " (minimum 100)" : ""}${f.den > 1 ? `, ${f.num} of ${f.den} months` : ""}`,
    qty: n,
    ratePaise: per,
    amountPaise: part(planYearly(plan, input.students, per)),
  }];
  if (input.hostel && list.hostel) items.push({ label: "Hostel add-on", qty: 1, ratePaise: list.hostel.pricePaise, amountPaise: part(list.hostel.pricePaise) });
  if (input.buses && list.transport) items.push({ label: `Transport add-on, ${input.buses} bus${input.buses === 1 ? "" : "es"}`, qty: input.buses, ratePaise: list.transport.pricePaise, amountPaise: part(list.transport.pricePaise * BigInt(input.buses)) });
  const words = input.discountReason === "group" ? `Group discount ${input.discountPercent}%` : `Discount ${input.discountPercent}%`;
  return finish(items, input.discountPercent, words);
}

const toJson = (items: Line[]) => items.map((l) => ({ label: l.label, qty: l.qty, ratePaise: l.ratePaise.toString(), amountPaise: l.amountPaise.toString() })) as Prisma.InputJsonValue;
export function itemsOf(inv: Pick<PlatformInvoice, "items">): Line[] {
  return (Array.isArray(inv.items) ? inv.items : []).map((x) => {
    const o = x as Record<string, string | number>;
    return { label: String(o.label ?? ""), qty: Number(o.qty ?? 1), ratePaise: BigInt(String(o.ratePaise ?? "0")), amountPaise: BigInt(String(o.amountPaise ?? "0")) };
  });
}
/** One line for lists: "Renewal: Essential, 142 students, group discount 10%". */
export function invoiceSummary(inv: Pick<PlatformInvoice, "items" | "kind">) {
  const items = itemsOf(inv);
  const main = items.filter((l) => l.amountPaise > 0n).map((l) => l.label).join(", ");
  const disc = items.find((l) => l.amountPaise < 0n);
  return `${main}${disc ? `, ${disc.label.toLowerCase()}` : ""}`;
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

async function nextInvoiceNumber(tx: Tx, on: Date) {
  const fy = fyShort(on);
  const key = `invoice:${fy}`;
  const row = await tx.consoleSequence.upsert({ where: { key }, create: { key, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
  const n = row.nextValue - 1;
  return `DT/${fy}/${String(n).padStart(4, "0")}`;
}

type NewInvoice = { schoolId: string; schoolName: string; subscriptionId?: string | null; kind: string; quote: Quote; students?: number | null; periodFrom?: Date | null; periodTo?: Date | null; dueOn: Date; status?: "UNPAID" | "WAITING"; issuedOn: Date };

async function makeInvoice(tx: Tx, actor: ConsoleActor, n: NewInvoice) {
  const number = await nextInvoiceNumber(tx, n.issuedOn);
  const inv = await tx.platformInvoice.create({
    data: {
      number,
      forSchoolId: n.schoolId,
      subscriptionId: n.subscriptionId ?? null,
      kind: n.kind,
      items: toJson(n.quote.items),
      subtotalPaise: n.quote.subtotal,
      discountPaise: n.quote.discount,
      gstPaise: n.quote.gst,
      totalPaise: n.quote.total,
      students: n.students ?? null,
      periodFrom: n.periodFrom ?? null,
      periodTo: n.periodTo ?? null,
      issuedOn: n.issuedOn,
      dueOn: n.dueOn,
      status: n.status ?? "UNPAID",
      createdById: actor.id,
    },
  });
  await logActivity(tx, actor, {
    type: "billing",
    school: { id: n.schoolId, name: n.schoolName },
    text: n.status === "WAITING"
      ? `made top-up invoice ${number} for ${n.schoolName}: ${invoiceSummary(inv)}, ${formatRupees(inv.totalPaise)} with GST. It waits for the Owner's OK before it is sent.`
      : `made invoice ${number} for ${n.schoolName}: ${invoiceSummary(inv)}, ${formatRupees(inv.totalPaise)} with GST.`,
  });
  return inv;
}

/**
 * Sends an invoice to the School Admins and the Principal with a Razorpay
 * payment link (made the first time). Without DREAM TEAM's Razorpay keys the
 * invoice still goes, saying to pay by bank transfer.
 */
export async function sendInvoice(actor: ConsoleActor, invoiceId: string, opts: { reminder?: string; now?: Date } = {}): Promise<{ delivered: Delivered[]; link: string | null; problem: string | null; number: string }> {
  const now = opts.now ?? new Date();
  const inv = await withConsole((tx) => tx.platformInvoice.findUnique({ where: { id: invoiceId } }));
  if (!inv) throw new ConsoleProblem("This invoice was not found.");
  if (inv.status !== "UNPAID") throw new ConsoleProblem(inv.status === "WAITING" ? "This top-up invoice waits for the Owner's OK." : `This invoice is ${inv.status === "PAID" ? "already paid" : "cancelled"}.`);
  const card = await getCard(inv.forSchoolId);
  if (!card) throw new ConsoleProblem("This school was not found.");
  const admins = (await schoolAdmins(inv.forSchoolId)).filter((a) => a.status !== "DISABLED");
  const first = admins.find((a) => a.roleKey === "school-admin") ?? admins[0];
  let link = inv.razorpayLinkUrl;
  let problem: string | null = null;
  const creds = platformRazorpay();
  if (!link && creds) {
    try {
      const made = await createPaymentLink(creds, {
        amountPaise: inv.totalPaise,
        referenceId: inv.number,
        description: `School OS invoice ${inv.number} for ${card.name}`,
        customer: { name: first?.name ?? card.name, contact: tenDigits(first?.phone), email: first?.email ?? card.email },
        notes: { invoiceId: inv.id, schoolCode: card.code },
      });
      link = made.short_url;
      await withConsole((tx) => tx.platformInvoice.update({ where: { id: inv.id }, data: { razorpayLinkId: made.id, razorpayLinkUrl: made.short_url } }));
    } catch (e) {
      problem = e instanceof RazorpayProblem ? e.message : "The Razorpay link could not be made just now.";
    }
  } else if (!creds) {
    problem = "DREAM TEAM's Razorpay keys are not set up on this server, so the invoice went without a payment link.";
  }
  const pay = link ? `Pay online: ${link}` : "Pay by bank transfer to DREAM TEAM SERVICES and send us the UTR number.";
  const head = opts.reminder ?? `Invoice ${inv.number} from DREAM TEAM SERVICES.`;
  const body = `${head}\n${invoiceSummary(inv)}.\nAmount: ${formatRupees(inv.totalPaise)} including GST. Due on ${formatDate(inv.dueOn)}.\n${pay}`;
  const safe = link ? body.replace(link, "[payment link]") : body;
  const messages: ConsoleOutgoing[] = [];
  for (const a of admins) {
    const d = tenDigits(a.phone);
    if (d) messages.push({ channel: "whatsapp", to: d, purpose: "invoice", text: `School OS, ${card.name}.\n${body}`, safeText: `School OS, ${card.name}.\n${safe}`, templateParams: [card.name, inv.number, formatRupees(inv.totalPaise), formatDate(inv.dueOn), link ?? ""], schoolId: card.id });
    if (a.email) messages.push({ channel: "email", to: a.email, purpose: "invoice", subject: `${opts.reminder ? "Reminder: " : ""}School OS invoice ${inv.number}`, text: `Hello ${a.name},\n\n${body}\n\nDREAM TEAM SERVICES`, safeText: safe, schoolId: card.id });
  }
  const delivered = await deliver(messages);
  await withConsoleSchool(inv.forSchoolId, async (tx) => {
    await tx.platformInvoice.update({ where: { id: inv.id }, data: { sentAt: now } });
    await logActivity(tx, actor, {
      type: "billing",
      school: { id: card.id, name: card.name },
      text: `${opts.reminder ? "sent a renewal reminder with" : inv.sentAt ? "resent" : "sent"} invoice ${inv.number} to ${card.name}${link ? " with its Razorpay link" : " (no payment link)"}.`,
    });
    await refreshBilling(tx, inv.forSchoolId, now);
  });
  return { delivered, link, problem, number: inv.number };
}

/** Marks an invoice paid and does what paying does: credits, status, reactivation. */
async function applyPayment(tx: Tx, actor: ConsoleActor, inv: PlatformInvoice, paid: { via: "RAZORPAY" | "BANK" | "CHEQUE"; ref: string | null; at: Date }) {
  const card = await tx.consoleSchool.findUniqueOrThrow({ where: { id: inv.forSchoolId } });
  await tx.platformInvoice.update({ where: { id: inv.id }, data: { status: "PAID", paidAt: paid.at, paidVia: paid.via, paidRef: paid.ref, markedPaidById: paid.via === "RAZORPAY" ? null : actor.id } });
  const ctx = { schoolId: inv.forSchoolId, userId: null };
  // Message credits that come with a year (or a credit pack) are added when it is paid.
  let credits = 0;
  if (inv.kind === "CREDITS") credits = Number(itemsOf(inv)[0]?.qty ?? 0);
  if ((inv.kind === "NEW" || inv.kind === "RENEWAL") && inv.students) {
    const sub = inv.subscriptionId ? await tx.subscription.findUnique({ where: { id: inv.subscriptionId } }) : null;
    const list = await priceList(tx, inv.issuedOn);
    const plan = list[sub?.planKey ?? "essential"];
    credits = Math.max(inv.students, plan?.minStudents ?? 100) * (plan?.creditsPerStudent ?? 0);
  }
  if (credits > 0) await tx.creditLedgerEntry.create({ data: { schoolId: inv.forSchoolId, channel: "whatsapp", amount: credits, note: `${INVOICE_KIND_LABEL[inv.kind]} ${inv.number}: ${credits.toLocaleString("en-IN")} message credits` } });
  await writeAudit(tx, ctx, { action: "DREAM TEAM invoice paid", recordType: "Platform Invoice", recordId: inv.id, after: { number: inv.number, via: paid.via, credits } });
  await logActivity(tx, actor, {
    type: "billing",
    school: { id: card.id, name: card.name },
    text: paid.via === "RAZORPAY"
      ? `Invoice ${inv.number} for ${card.name} was paid by Razorpay${paid.ref ? ` (${paid.ref})` : ""}, ${formatRupees(inv.totalPaise)}.`
      : `marked invoice ${inv.number} for ${card.name} paid by ${paid.via === "BANK" ? "bank transfer" : "cheque"} (${paid.ref}), ${formatRupees(inv.totalPaise)}, received ${formatDate(paid.at)}.`,
    from: inv.status === "UNPAID" ? "Unpaid" : inv.status,
    to: "Paid",
  });
  // Paying makes a Trial school Active, and reactivates a Suspended school at once.
  if (card.status === "TRIAL" || card.status === "SUSPENDED") {
    const to = "ACTIVE";
    await tx.school.update({ where: { id: card.id }, data: { status: to } });
    await tx.consoleSchool.update({ where: { id: card.id }, data: { status: to, statusSince: paid.at, keepUntil: null, trialEndsOn: card.status === "TRIAL" ? card.trialEndsOn : card.trialEndsOn } });
    const reason = card.status === "TRIAL" ? `Invoice ${inv.number} paid` : `Overdue invoice ${inv.number} paid`;
    await tx.schoolStatusChange.create({ data: { forSchoolId: card.id, fromStatus: card.status, toStatus: to, reason, byId: null, byName: "School OS (automatic)" } });
    await logActivity(tx, SYSTEM_ACTOR, { type: "status", school: { id: card.id, name: card.name }, text: `${card.name} became Active when invoice ${inv.number} was paid.`, from: STATUS_LABEL[card.status], to: "Active" });
  }
  await refreshBilling(tx, inv.forSchoolId, paid.at);
}

/** Owner only: a bank transfer or cheque, with the reference number. */
export async function markPaid(actor: ConsoleActor, invoiceId: string, input: { via: "BANK" | "CHEQUE"; ref: string; receivedOn: Date }, now = new Date()) {
  const ref = input.ref.trim();
  if (ref.length < 4) throw new ConsoleProblem(input.via === "CHEQUE" ? "Enter the cheque number and bank." : "Enter the UTR (bank reference number).", "ref");
  if (input.receivedOn > istDay(now)) throw new ConsoleProblem("The date received cannot be in the future.", "receivedOn");
  const inv = await withConsole((tx) => tx.platformInvoice.findUnique({ where: { id: invoiceId } }));
  if (!inv) throw new ConsoleProblem("This invoice was not found.");
  if (inv.status !== "UNPAID") throw new ConsoleProblem(`This invoice is ${inv.status === "PAID" ? "already paid" : inv.status === "WAITING" ? "waiting for the Owner's OK; send it first" : "cancelled"}.`);
  const before = await getCard(inv.forSchoolId);
  await withConsoleSchool(inv.forSchoolId, (tx) => applyPayment(tx, actor, inv, { via: input.via, ref: `${input.via === "CHEQUE" ? "Cheque" : "UTR"} ${ref}`, at: input.receivedOn }));
  return { number: inv.number, reactivated: before?.status === "SUSPENDED" };
}

/** A Razorpay payment link was paid (webhook). Safe to receive twice. */
export async function paidByRazorpay(linkId: string, paymentId: string | null, amountPaise: number, now = new Date()) {
  const inv = await withConsole((tx) => tx.platformInvoice.findUnique({ where: { razorpayLinkId: linkId } }));
  if (!inv) return { ok: false as const, reason: "unknown link" };
  if (inv.status === "PAID") return { ok: true as const, already: true };
  if (inv.status !== "UNPAID") return { ok: false as const, reason: `invoice ${inv.status.toLowerCase()}` };
  if (BigInt(amountPaise) !== inv.totalPaise) return { ok: false as const, reason: "amount differs" };
  await withConsoleSchool(inv.forSchoolId, async (tx) => {
    await applyPayment(tx, SYSTEM_ACTOR, inv, { via: "RAZORPAY", ref: paymentId, at: now });
    const card = await tx.consoleSchool.findUnique({ where: { id: inv.forSchoolId }, select: { name: true } });
    await notifyTeam(tx, { roles: ["OWNER"], text: `${card?.name ?? "A school"} paid invoice ${inv.number}, ${formatRupees(inv.totalPaise)}, by Razorpay.`, link: "/console/billing", tone: "ok" });
  });
  return { ok: true as const, already: false };
}

/** Owner only: a wrong invoice is cancelled with a reason, never deleted. Its link stops working. */
export async function cancelInvoice(actor: ConsoleActor, invoiceId: string, reason: string, now = new Date()) {
  if (reason.trim().length < 5) throw new ConsoleProblem("Give the reason in a few words.", "reason");
  const inv = await withConsole((tx) => tx.platformInvoice.findUnique({ where: { id: invoiceId } }));
  if (!inv) throw new ConsoleProblem("This invoice was not found.");
  if (inv.status === "PAID") throw new ConsoleProblem("A paid invoice cannot be cancelled.");
  if (inv.status === "CANCELLED") throw new ConsoleProblem("This invoice is already cancelled.");
  const creds = platformRazorpay();
  if (inv.razorpayLinkId && creds) await cancelPaymentLink(creds, inv.razorpayLinkId).catch(() => null);
  const card = await getCard(inv.forSchoolId);
  await withConsoleSchool(inv.forSchoolId, async (tx) => {
    await tx.platformInvoice.update({ where: { id: inv.id }, data: { status: "CANCELLED", cancelledAt: now, cancelReason: reason.trim(), cancelledById: actor.id } });
    await logActivity(tx, actor, { type: "billing", school: { id: inv.forSchoolId, name: card?.name ?? "" }, text: `cancelled invoice ${inv.number} for ${card?.name}: “${reason.trim()}”`, from: inv.status === "WAITING" ? "Waiting" : "Unpaid", to: "Cancelled" });
    await refreshBilling(tx, inv.forSchoolId, now);
  });
  return { number: inv.number };
}

/** Owner's OK for a top-up invoice the software made: it is sent now. */
export async function approveTopup(actor: ConsoleActor, invoiceId: string, now = new Date()) {
  const inv = await withConsole((tx) => tx.platformInvoice.findUnique({ where: { id: invoiceId } }));
  if (!inv || inv.status !== "WAITING") throw new ConsoleProblem("This top-up invoice is no longer waiting.");
  const card = await getCard(inv.forSchoolId);
  await withConsole(async (tx) => {
    await tx.platformInvoice.update({ where: { id: inv.id }, data: { status: "UNPAID", issuedOn: istDay(now), dueOn: addDays(istDay(now), PAY_WITHIN_DAYS) } });
    await logActivity(tx, actor, { type: "billing", school: { id: inv.forSchoolId, name: card?.name ?? "" }, text: `gave the OK for top-up invoice ${inv.number} for ${card?.name}.`, from: "Waiting", to: "Unpaid" });
  });
  return sendInvoice(actor, inv.id, { now });
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export type PlanChoice = { planKey: PlanKey; hostel: boolean; buses: number; students: number; payIn: "YEARLY" | "HALVES" };

async function groupPercent(tx: Tx, groupId: string | null) {
  if (!groupId) return 0;
  const n = await tx.consoleSchool.count({ where: { groupId, status: { in: ["TRIAL", "ACTIVE", "SUSPENDED"] } } });
  return groupDiscountFor(n);
}

/** A school's first plan (Add School as Active, or a Trial school that pays): the subscription and its first invoice. */
export async function startSubscription(actor: ConsoleActor, schoolId: string, choice: PlanChoice, now = new Date()) {
  if (!PLAN_KEYS.includes(choice.planKey)) throw new ConsoleProblem("Choose Essential or Complete.", "planKey");
  if (!Number.isInteger(choice.students) || choice.students < 1 || choice.students > 100_000) throw new ConsoleProblem("Enter the number of students to bill.", "students");
  const today = istDay(now);
  const made = await withConsoleSchool(schoolId, async (tx) => {
    const card = await tx.consoleSchool.findUnique({ where: { id: schoolId } });
    if (!card) throw new ConsoleProblem("This school was not found.");
    if (card.status === "CLOSED") throw new ConsoleProblem(`${card.name} is closed.`);
    if (await tx.subscription.findUnique({ where: { forSchoolId: schoolId } })) throw new ConsoleProblem(`${card.name} already has a plan. Use Change plan.`);
    const list = await priceList(tx, today);
    const pct = await groupPercent(tx, card.groupId);
    const plan = list[choice.planKey];
    const sub = await tx.subscription.create({
      data: {
        forSchoolId: schoolId, planKey: choice.planKey, hostel: choice.hostel, buses: 0, studentsPaidFor: Math.max(choice.students, plan.minStudents),
        pricePerStudentPaise: plan.pricePaise, discountPercent: pct, discountReason: pct ? "group" : null, startOn: today, renewOn: addMonths(today, 12), payIn: choice.payIn, status: "DUE",
      },
    });
    const half = choice.payIn === "HALVES";
    const quote = quoteYear(list, { planKey: choice.planKey, students: choice.students, hostel: choice.hostel, discountPercent: pct, discountReason: pct ? "group" : null, fraction: half ? { num: 6, den: 12 } : undefined, label: half ? "First half" : "First year" });
    await logActivity(tx, actor, { type: "billing", school: { id: schoolId, name: card.name }, text: `chose ${PLAN_LABEL[choice.planKey]}${choice.hostel ? " with Hostel" : ""} for ${card.name}: ${sub.studentsPaidFor.toLocaleString("en-IN")} students, paid ${half ? "in two halves" : "yearly"}, renewal on ${formatDate(sub.renewOn)}.`, to: `${PLAN_LABEL[choice.planKey]}${choice.hostel ? " + Hostel" : ""}` });
    const inv = await makeInvoice(tx, actor, { schoolId, schoolName: card.name, subscriptionId: sub.id, kind: "NEW", quote, students: sub.studentsPaidFor, periodFrom: today, periodTo: half ? addMonths(today, 6) : sub.renewOn, issuedOn: today, dueOn: card.status === "TRIAL" && card.trialEndsOn && card.trialEndsOn > today ? card.trialEndsOn : addDays(today, PAY_WITHIN_DAYS) });
    return inv;
  });
  return sendInvoice(actor, made.id, { now });
}

/** Upgrade from today (the difference for the rest of the year is invoiced) or downgrade at renewal. */
export async function changePlan(actor: ConsoleActor, schoolId: string, choice: Pick<PlanChoice, "planKey" | "hostel">, now = new Date()) {
  const today = istDay(now);
  const r = await withConsoleSchool(schoolId, async (tx) => {
    const card = await tx.consoleSchool.findUniqueOrThrow({ where: { id: schoolId } });
    const sub = await tx.subscription.findUnique({ where: { forSchoolId: schoolId } });
    if (!sub) throw new ConsoleProblem(`${card.name} has no plan yet. Choose its first plan.`);
    const founding = sub.discountReason === "founding";
    const planKey = founding ? sub.planKey : choice.planKey;
    const list = await priceList(tx, sub.startOn);
    const yearOf = (pk: string, hostel: boolean) => quoteYear(list, { planKey: pk, students: sub.studentsPaidFor, hostel, discountPercent: sub.discountPercent, discountReason: sub.discountReason, founding, pricePerStudent: founding || pk === sub.planKey ? sub.pricePerStudentPaise : undefined }).taxable;
    const cur = yearOf(sub.planKey, sub.hostel);
    const next = yearOf(planKey, choice.hostel);
    const from = `${PLAN_LABEL[sub.planKey]}${sub.hostel ? " + Hostel" : ""}`;
    const to = `${PLAN_LABEL[planKey]}${choice.hostel ? " + Hostel" : ""}`;
    if (next === cur && planKey === sub.planKey && choice.hostel === sub.hostel) return { kind: "same" as const };
    if (next > cur) {
      const months = monthsLeft(today, sub.renewOn);
      const diff = ((next - cur) * BigInt(months) + 6n) / 12n;
      const quote = finish([{ label: `Plan change: ${from} to ${to}, ${months} month${months === 1 ? "" : "s"}`, qty: 1, ratePaise: diff, amountPaise: diff }]);
      await tx.subscription.update({ where: { id: sub.id }, data: { planKey, hostel: choice.hostel, nextPlanKey: null, pricePerStudentPaise: founding ? sub.pricePerStudentPaise : list[planKey].pricePaise } });
      if (choice.hostel && !sub.hostel) await tx.schoolModule.updateMany({ where: { schoolId, moduleKey: "hostel-management" }, data: { isOn: true } });
      await logActivity(tx, actor, { type: "billing", school: { id: schoolId, name: card.name }, text: `changed ${card.name}’s plan from today. The difference for the rest of the year is invoiced.`, from, to });
      const inv = await makeInvoice(tx, actor, { schoolId, schoolName: card.name, subscriptionId: sub.id, kind: "UPGRADE", quote, issuedOn: today, dueOn: addDays(today, 7), periodFrom: today, periodTo: sub.renewOn });
      return { kind: "up" as const, invoiceId: inv.id };
    }
    await tx.subscription.update({ where: { id: sub.id }, data: { nextPlanKey: planKey, nextHostel: choice.hostel } });
    await logActivity(tx, actor, { type: "billing", school: { id: schoolId, name: card.name }, text: `changed ${card.name}’s plan from the renewal on ${formatDate(sub.renewOn)}. Nothing changes before then.`, from, to });
    return { kind: "down" as const, renewOn: sub.renewOn };
  });
  if (r.kind === "up") return { ...r, sent: await sendInvoice(actor, r.invoiceId, { now }) };
  return r;
}

/** Owner or Onboarding: send an invoice for a year (first year or renewal) or a credit pack. */
export async function invoiceFor(actor: ConsoleActor, schoolId: string, what: { kind: "CREDITS"; credits: number } | { kind: "YEAR" }, now = new Date()) {
  const today = istDay(now);
  const made = await withConsoleSchool(schoolId, async (tx) => {
    const card = await tx.consoleSchool.findUniqueOrThrow({ where: { id: schoolId } });
    if (card.status === "CLOSED") throw new ConsoleProblem(`${card.name} is closed.`);
    if (what.kind === "CREDITS") {
      const pack = CREDIT_PACKS.find((p) => p.credits === what.credits);
      if (!pack) throw new ConsoleProblem("Choose a credit pack.", "pack");
      const quote = finish([{ label: `Message credits: ${pack.credits.toLocaleString("en-IN")}`, qty: pack.credits, ratePaise: pack.paise / BigInt(pack.credits), amountPaise: pack.paise }]);
      return makeInvoice(tx, actor, { schoolId, schoolName: card.name, kind: "CREDITS", quote, issuedOn: today, dueOn: addDays(today, PAY_WITHIN_DAYS) });
    }
    const sub = await tx.subscription.findUnique({ where: { forSchoolId: schoolId } });
    if (!sub) throw new ConsoleProblem(`${card.name} has no plan yet. Choose its plan, which sends the first invoice.`);
    const open = await tx.platformInvoice.findFirst({ where: { forSchoolId: schoolId, kind: { in: ["NEW", "RENEWAL"] }, status: { in: ["UNPAID", "WAITING"] } } });
    if (open) throw new ConsoleProblem(`Invoice ${open.number} for this year is still unpaid. Resend it instead.`);
    return renewalInvoice(tx, actor, card.name, sub, today);
  });
  return sendInvoice(actor, made.id, { now });
}

async function renewalInvoice(tx: Tx, actor: ConsoleActor, schoolName: string, sub: Subscription, today: Date) {
  const card = await tx.consoleSchool.findUniqueOrThrow({ where: { id: sub.forSchoolId } });
  const from = sub.renewOn;
  const list = await priceList(tx, from);
  const founding = sub.discountReason === "founding" && sub.priceLockedUntil && sub.priceLockedUntil > from;
  const pk = sub.nextPlanKey ?? sub.planKey;
  const hostel = sub.nextHostel ?? sub.hostel;
  const students = Math.max(card.activeStudents, list[pk]?.minStudents ?? 100);
  const pct = founding ? sub.discountPercent : Math.max(await groupPercent(tx, card.groupId), sub.discountReason === "group" ? 0 : sub.discountPercent);
  const half = sub.payIn === "HALVES";
  const quote = quoteYear(list, { planKey: pk, students, hostel, discountPercent: pct, discountReason: pct ? (sub.discountReason ?? "group") : null, founding: Boolean(founding), pricePerStudent: founding ? sub.pricePerStudentPaise : undefined, fraction: half ? { num: 6, den: 12 } : undefined, label: half ? "Renewal, first half" : "Renewal" });
  return makeInvoice(tx, actor, { schoolId: sub.forSchoolId, schoolName, subscriptionId: sub.id, kind: "RENEWAL", quote, students, periodFrom: from, periodTo: half ? addMonths(from, 6) : addMonths(from, 12), issuedOn: today, dueOn: from > today ? from : addDays(today, PAY_WITHIN_DAYS) });
}

/** Top-up for more students than paid for: the rest of the year at half the yearly rate. */
export async function topupInvoice(actor: ConsoleActor, schoolId: string, opts: { waitForOk: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  const today = istDay(now);
  const made = await withConsoleSchool(schoolId, async (tx) => {
    const card = await tx.consoleSchool.findUniqueOrThrow({ where: { id: schoolId } });
    const sub = await tx.subscription.findUnique({ where: { forSchoolId: schoolId } });
    if (!sub) throw new ConsoleProblem(`${card.name} has no plan yet.`);
    const extra = card.activeStudents - sub.studentsPaidFor;
    if (extra <= 0) throw new ConsoleProblem(`${card.name} has ${card.activeStudents.toLocaleString("en-IN")} active students, within the ${sub.studentsPaidFor.toLocaleString("en-IN")} paid for.`);
    const waiting = await tx.platformInvoice.findFirst({ where: { forSchoolId: schoolId, kind: "TOPUP", status: { in: ["WAITING", "UNPAID"] } } });
    if (waiting) throw new ConsoleProblem(`Top-up invoice ${waiting.number} is already ${waiting.status === "WAITING" ? "waiting for the Owner's OK" : "sent"}.`);
    const rate = sub.pricePerStudentPaise / 2n;
    const quote = finish([{ label: `Top-up: ${extra.toLocaleString("en-IN")} students above the ${sub.studentsPaidFor.toLocaleString("en-IN")} paid for, rest of the year at half rate (${formatRupees(rate)} each)`, qty: extra, ratePaise: rate, amountPaise: rate * BigInt(extra) }], sub.discountPercent, sub.discountReason === "group" ? `Group discount ${sub.discountPercent}%` : undefined);
    const inv = await makeInvoice(tx, actor, { schoolId, schoolName: card.name, subscriptionId: sub.id, kind: "TOPUP", quote, students: extra, issuedOn: today, dueOn: addDays(today, PAY_WITHIN_DAYS), periodFrom: today, periodTo: sub.renewOn, status: opts.waitForOk ? "WAITING" : "UNPAID" });
    await tx.subscription.update({ where: { id: sub.id }, data: { studentsPaidFor: card.activeStudents } });
    return inv;
  });
  if (opts.waitForOk) return { invoiceId: made.id, number: made.number, sent: null };
  return { invoiceId: made.id, number: made.number, sent: await sendInvoice(actor, made.id, { now }) };
}

/** Owner only: the first 20 paying schools get the Essential price locked for 3 years. */
export async function markFounding(actor: ConsoleActor, schoolId: string, now = new Date()) {
  return withConsoleSchool(schoolId, async (tx) => {
    const card = await tx.consoleSchool.findUniqueOrThrow({ where: { id: schoolId } });
    const sub = await tx.subscription.findUnique({ where: { forSchoolId: schoolId } });
    if (!sub) throw new ConsoleProblem(`${card.name} has no plan yet. Choose its plan first.`);
    if (sub.discountReason === "founding") throw new ConsoleProblem(`${card.name} is already founding school ${sub.foundingNumber}.`);
    const count = await tx.subscription.count({ where: { discountReason: "founding" } });
    if (count >= FOUNDING_LIMIT) throw new ConsoleProblem(`All ${FOUNDING_LIMIT} founding school places are taken.`);
    const list = await priceList(tx, sub.startOn);
    const lockedUntil = addMonths(sub.startOn, FOUNDING_YEARS * 12);
    await tx.subscription.update({ where: { id: sub.id }, data: { discountReason: "founding", discountPercent: 0, foundingNumber: count + 1, priceLockedUntil: lockedUntil, pricePerStudentPaise: list.essential.pricePaise } });
    await logActivity(tx, actor, { type: "billing", school: { id: schoolId, name: card.name }, text: `marked ${card.name} as founding school ${count + 1} of ${FOUNDING_LIMIT}: Essential price locked until ${formatDate(lockedUntil)}, every new module switched on free as it is built.`, to: "Founding school" });
    void now;
    return { number: count + 1, lockedUntil };
  });
}

/** Owner only: the group discount for the school's Group size (10% for 3 to 4 schools, 15% for 5 or more). */
export async function applyGroupDiscount(actor: ConsoleActor, schoolId: string) {
  return withConsoleSchool(schoolId, async (tx) => {
    const card = await tx.consoleSchool.findUniqueOrThrow({ where: { id: schoolId } });
    const sub = await tx.subscription.findUnique({ where: { forSchoolId: schoolId } });
    if (!sub) throw new ConsoleProblem(`${card.name} has no plan yet.`);
    if (sub.discountReason === "founding") throw new ConsoleProblem(`${card.name} is a founding school; its price is already locked.`);
    if (!card.groupId) throw new ConsoleProblem(`${card.name} is not in a Group. Set its Group first.`);
    const pct = await groupPercent(tx, card.groupId);
    if (pct === 0) throw new ConsoleProblem(`${card.groupName} has fewer than 3 schools, so no group discount applies yet.`);
    if (sub.discountPercent === pct && sub.discountReason === "group") throw new ConsoleProblem(`${card.name} already has the ${pct}% group discount.`);
    await tx.subscription.update({ where: { id: sub.id }, data: { discountPercent: pct, discountReason: "group" } });
    await logActivity(tx, actor, { type: "billing", school: { id: schoolId, name: card.name }, text: `gave ${card.name} the ${card.groupName} group discount from the next invoice.`, from: `${sub.discountPercent}%`, to: `${pct}%` });
    return { pct };
  });
}

/** Owner only: a new price list from a date. Renewals after it use it; nothing changes mid-year. */
export async function changePrices(actor: ConsoleActor, input: { essential: bigint; complete: bigint; hostel: bigint; validFrom: Date }, now = new Date()) {
  const today = istDay(now);
  if (input.validFrom < today) throw new ConsoleProblem("The new prices can start today or later, never in the past.", "validFrom");
  for (const [k, v] of Object.entries({ essential: input.essential, complete: input.complete, hostel: input.hostel })) {
    if (v <= 0n) throw new ConsoleProblem(`Enter the ${PLAN_LABEL[k]} price.`, k);
  }
  return withConsole(async (tx) => {
    const cur = await priceList(tx, input.validFrom);
    const changes: string[] = [];
    for (const key of ["essential", "complete", "hostel"] as const) {
      const price = input[key];
      const old = cur[key];
      if (old && old.pricePaise === price) continue;
      await tx.plan.upsert({
        where: { key_validFrom: { key, validFrom: input.validFrom } },
        create: { key, name: PLAN_LABEL[key], isAddOn: key === "hostel", unit: key === "hostel" ? "per-school" : "per-student", pricePaise: price, minStudents: old?.minStudents ?? (key === "hostel" ? 0 : 100), priceAbove1000Paise: key === "hostel" ? null : price / 2n, creditsPerStudent: old?.creditsPerStudent ?? 0, storageGb: old?.storageGb ?? null, modules: old?.modules ?? [], validFrom: input.validFrom, createdById: actor.id },
        update: { pricePaise: price, priceAbove1000Paise: key === "hostel" ? null : price / 2n, createdById: actor.id },
      });
      changes.push(`${PLAN_LABEL[key]} ${old ? formatRupees(old.pricePaise) : "none"} to ${formatRupees(price)}`);
    }
    if (changes.length === 0) throw new ConsoleProblem("No price changed.");
    await logActivity(tx, actor, { type: "billing", text: `changed the price list from ${formatDate(input.validFrom)}: ${changes.join("; ")}. Only renewals after that day use the new prices.` });
    return { changes };
  });
}

// ---------------------------------------------------------------------------
// Status and the school's banner
// ---------------------------------------------------------------------------

/**
 * Works out the subscription's status from the unpaid invoices, and keeps the
 * School's billing notice (the banner for its School Admin and Principal, and
 * the pay button on the paused page) in step.
 */
export async function refreshBilling(tx: Tx, schoolId: string, now = new Date()) {
  const today = istDay(now);
  const unpaid = await tx.platformInvoice.findMany({ where: { forSchoolId: schoolId, status: "UNPAID", sentAt: { not: null } }, orderBy: { dueOn: "asc" } });
  const sub = await tx.subscription.findUnique({ where: { forSchoolId: schoolId } });
  const first = unpaid[0] ?? null;
  let status: "PAID" | "DUE" | "GRACE" | "OVERDUE" = "PAID";
  if (first) {
    const late = daysBetween(first.dueOn, today);
    status = late <= 0 ? "DUE" : late <= GRACE_DAYS ? "GRACE" : "OVERDUE";
  }
  if (sub && sub.status !== status) await tx.subscription.update({ where: { id: sub.id }, data: { status } });
  const notice = first
    ? { invoiceNo: first.number, amountPaise: first.totalPaise.toString(), dueOn: first.dueOn.toISOString().slice(0, 10), payUrl: first.razorpayLinkUrl, graceEndsOn: status === "GRACE" || status === "OVERDUE" ? addDays(first.dueOn, GRACE_DAYS).toISOString().slice(0, 10) : null }
    : null;
  // The school row is behind the school's own wall; callers run this inside withConsoleSchool.
  await tx.school.update({ where: { id: schoolId }, data: { billingNotice: notice ?? Prisma.DbNull } });
  return status;
}

// ---------------------------------------------------------------------------
// What happens by itself (run daily by the worker)
// ---------------------------------------------------------------------------

/** Trial ends, renewal reminders and invoices, grace and suspension, the six-month check. Safe to run many times a day. */
export async function runBillingDay(now = new Date()) {
  const today = istDay(now);
  const done: string[] = [];

  // 1. Trial end: 30 days without payment, the school becomes Suspended; data kept 90 days.
  const trials = await withConsole((tx) => tx.consoleSchool.findMany({ where: { status: "TRIAL", trialEndsOn: { lt: today } }, select: { id: true, name: true } }));
  for (const t of trials) {
    const paid = await withConsole((tx) => tx.platformInvoice.count({ where: { forSchoolId: t.id, status: "PAID" } }));
    if (paid > 0) continue;
    await changeStatus(null, t.id, "suspend", { reason: "Trial ended without payment. Data is kept 90 days." }, now, { system: true }).catch(() => null);
    done.push(`trial-ended:${t.name}`);
  }

  const subs = await withConsole((tx) => tx.subscription.findMany());
  for (const sub of subs) {
    const card = await getCard(sub.forSchoolId);
    if (!card || card.status === "CLOSED") continue;
    // 2. Renewal invoice 30 days before, then reminders at 15, 7 and 1 day.
    const daysTo = daysBetween(today, sub.renewOn);
    if (daysTo <= 30 && daysTo >= 0) {
      const hasRenewal = await withConsole((tx) => tx.platformInvoice.findFirst({ where: { forSchoolId: sub.forSchoolId, kind: "RENEWAL", periodFrom: sub.renewOn, status: { not: "CANCELLED" } } }));
      if (!hasRenewal) {
        const inv = await withConsoleSchool(sub.forSchoolId, (tx) => renewalInvoice(tx, SYSTEM_ACTOR, card.name, sub, today));
        await sendInvoice(SYSTEM_ACTOR, inv.id, { now, reminder: `Your School OS renewal is due on ${formatDate(sub.renewOn)}, in ${daysTo} day${daysTo === 1 ? "" : "s"}.` }).catch(() => null);
        await withConsole((tx) => tx.subscription.update({ where: { id: sub.id }, data: { remindersSent: [...new Set([...sub.remindersSent, `${sub.renewOn.toISOString().slice(0, 10)}:30`])] } }));
        done.push(`renewal-invoice:${card.name}`);
      } else if (hasRenewal.status === "UNPAID") {
        const step = REMINDER_DAYS.filter((d) => d < 30).find((d) => daysTo <= d && !sub.remindersSent.includes(`${sub.renewOn.toISOString().slice(0, 10)}:${d}`));
        if (step) {
          await sendInvoice(SYSTEM_ACTOR, hasRenewal.id, { now, reminder: `Reminder: your School OS renewal is due on ${formatDate(sub.renewOn)}, in ${daysTo} day${daysTo === 1 ? "" : "s"}.` }).catch(() => null);
          await withConsole((tx) => tx.subscription.update({ where: { id: sub.id }, data: { remindersSent: [...new Set([...sub.remindersSent, ...REMINDER_DAYS.filter((d) => d >= step).map((d) => `${sub.renewOn.toISOString().slice(0, 10)}:${d}`)])] } }));
          done.push(`reminder-${step}:${card.name}`);
        }
      }
    }
    // 3. The new year starts on the renewal date.
    if (today >= sub.renewOn) {
      const renewal = await withConsole((tx) => tx.platformInvoice.findFirst({ where: { forSchoolId: sub.forSchoolId, kind: "RENEWAL", periodFrom: sub.renewOn, status: { not: "CANCELLED" } } }));
      await withConsole((tx) => tx.subscription.update({
        where: { id: sub.id },
        data: { startOn: sub.renewOn, renewOn: addMonths(sub.renewOn, 12), planKey: sub.nextPlanKey ?? sub.planKey, hostel: sub.nextHostel ?? sub.hostel, nextPlanKey: null, nextHostel: null, studentsPaidFor: renewal?.students ?? sub.studentsPaidFor, sixMonthCheckedAt: null, remindersSent: [] },
      }));
      done.push(`rolled:${card.name}`);
    }
    // 4. Second half, and the six-month check.
    const six = addMonths(sub.startOn, 6);
    if (today >= six && today < sub.renewOn && !sub.sixMonthCheckedAt) {
      if (sub.payIn === "HALVES") {
        const has = await withConsole((tx) => tx.platformInvoice.findFirst({ where: { forSchoolId: sub.forSchoolId, kind: "SECOND_HALF", periodFrom: six, status: { not: "CANCELLED" } } }));
        if (!has) {
          const inv = await withConsoleSchool(sub.forSchoolId, async (tx) => {
            const list = await priceList(tx, sub.startOn);
            const founding = sub.discountReason === "founding";
            const quote = quoteYear(list, { planKey: sub.planKey, students: sub.studentsPaidFor, hostel: sub.hostel, discountPercent: sub.discountPercent, discountReason: sub.discountReason, founding, pricePerStudent: sub.pricePerStudentPaise, fraction: { num: 6, den: 12 }, label: "Second half" });
            return makeInvoice(tx, SYSTEM_ACTOR, { schoolId: sub.forSchoolId, schoolName: card.name, subscriptionId: sub.id, kind: "SECOND_HALF", quote, students: sub.studentsPaidFor, periodFrom: six, periodTo: sub.renewOn, issuedOn: today, dueOn: addDays(today, PAY_WITHIN_DAYS) });
          });
          await sendInvoice(SYSTEM_ACTOR, inv.id, { now }).catch(() => null);
          done.push(`second-half:${card.name}`);
        }
      }
      // More than 10% above what was paid for: a top-up invoice that waits for the Owner's OK.
      if (card.activeStudents * 10 > sub.studentsPaidFor * 11) {
        const made = await topupInvoice(SYSTEM_ACTOR, sub.forSchoolId, { waitForOk: true, now }).catch(() => null);
        if (made) await withConsole((tx) => notifyTeam(tx, { roles: ["OWNER"], text: `A top-up invoice for ${card.name} waits for your OK: ${card.activeStudents} students, ${sub.studentsPaidFor} paid for.`, link: "/console/billing", tone: "warn" }));
        done.push(`topup:${card.name}`);
      }
      await withConsole((tx) => tx.subscription.update({ where: { id: sub.id }, data: { sixMonthCheckedAt: now } }));
    }
    // 5. Grace, then Suspended.
    const status = await withConsoleSchool(sub.forSchoolId, (tx) => refreshBilling(tx, sub.forSchoolId, now));
    if (status === "OVERDUE" && card.status === "ACTIVE") {
      const overdue = await withConsole((tx) => tx.platformInvoice.findFirst({ where: { forSchoolId: sub.forSchoolId, status: "UNPAID", kind: { in: ["NEW", "RENEWAL", "SECOND_HALF"] }, dueOn: { lt: addDays(today, -GRACE_DAYS) } } }));
      if (overdue) {
        const moved = await changeStatus(null, sub.forSchoolId, "suspend", { reason: `Invoice ${overdue.number} unpaid ${GRACE_DAYS} days after its date` }, now, { system: true }).catch(() => null);
        if (moved) await withConsole((tx) => notifyTeam(tx, { roles: ["OWNER", "SUPPORT"], text: `${card.name} was suspended: invoice ${overdue.number} is unpaid ${GRACE_DAYS} days after its due date.`, link: `/console/schools/${sub.forSchoolId}`, tone: "bad" }));
        done.push(`suspended:${card.name}`);
      }
    }
  }
  return done;
}
