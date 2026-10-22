// How to pay, in every fee reminder (06 §2 Defaulters, A7; gap list G11).
//
// The {how_to_pay} blank (and {link}) of a reminder says, for each guardian
// and child, the way that works for them:
//
// - online payment set up for the child's class (Razorpay, chosen in Fee
//   Settings) and the guardian has an active Parent Link (Parent Link and its
//   fees part on in Message Settings): their own Parent Link, with its Pay
//   button. It is tied to the guardian: a new phone needs a one-time code,
//   and the school can revoke it;
// - online payment set up but no Parent Link: a payment link for exactly the
//   fees the reminder is about, which works for 7 days (LINK_DAYS) and pays
//   only those fees. The same open link is used again by the next reminder;
// - no online payment: "Please pay at the school office.", with the Parent
//   Link where the guardian has one, to see what is due.
//
// Message texts keep placeholders, never a link that opens or pays: the
// secret is worked out with the server key only when the message is handed to
// the provider (src/lib/parent-link/token.ts).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { formatDate } from "../format";
import { messageSettings } from "../messaging/settings";
import { payPlaceholderFor, placeholderFor } from "../parent-link/token";
import { createPaymentLink, LINK_DAYS } from "./online";
import { MoneyProblem } from "./problem";
import { gatewayFor } from "./settings";

export const COUNTER_WORDS = "Please pay at the school office.";
/** What {link} says when there is no link to give. */
export const NO_LINK = "the school office";

export type PayWay = "parent-link" | "pay-link" | "parent-link-counter" | "counter";

/** The way to pay in the school's words, for Fee Settings and previews. */
export const PAY_WAY_WORDS: Record<PayWay, string> = {
  "parent-link": "Pay online on their own Parent Link (Razorpay)",
  "pay-link": `A payment link for these fees (Razorpay) that works for ${LINK_DAYS} days`,
  "parent-link-counter": "Pay at the school office; the fees due are on their Parent Link",
  counter: "Pay at the school office",
};

/** The words of {how_to_pay}. Each link is last, so nothing sticks to it. */
export function howToPay(way: PayWay, link: string | null, until: Date | null = null): string {
  switch (way) {
    case "parent-link": return `Pay online on your Parent Link: ${link}`;
    case "pay-link": return `Pay online with this link${until ? ` (it works until ${formatDate(until)})` : ""}: ${link}`;
    case "parent-link-counter": return `${COUNTER_WORDS} The fees due are on your Parent Link: ${link}`;
    default: return COUNTER_WORDS;
  }
}

export type PayValues = { link: string; how_to_pay: string };

export type PayPlan = {
  /** For guardians without a Parent Link (or when it is off), by student. */
  perStudent: Record<string, PayValues>;
  /** For guardians with a Parent Link, keyed "guardianId:studentId". */
  perGuardianStudent: Record<string, PayValues>;
  /** The way for each student's guardians without a Parent Link. */
  ways: Map<string, PayWay>;
  /** The way for each guardian with a Parent Link, keyed "guardianId:studentId". */
  guardianWays: Map<string, PayWay>;
};

/** A placeholder that is never a real link: previews show it as "[payment link]". */
const PREVIEW_LINK_ID = "00000000-0000-0000-0000-000000000000";

/**
 * How each guardian pays each child's reminder. `online` off (a person
 * unticked "Include payment link") gives the school office only. With
 * `makeLinks` off (a preview) no payment link is made: a stand-in shows where it goes.
 */
export async function payPlan(
  tx: Tx,
  ctx: SchoolContext,
  rows: { studentId: string; dueIds: string[]; classId: string | null }[],
  opts: { online: boolean; makeLinks: boolean; allGuardians: boolean },
): Promise<PayPlan> {
  const plan: PayPlan = { perStudent: {}, perGuardianStudent: {}, ways: new Map(), guardianWays: new Map() };
  if (!rows.length) return plan;
  const ids = rows.map((r) => r.studentId);
  const settings = await messageSettings(tx, ctx);
  const linkOn = opts.online && settings.parentLink.on && settings.parentLink.shows.fees !== false;
  const family = await tx.studentGuardian.findMany({
    where: { studentId: { in: ids }, archivedAt: null, ...(opts.allGuardians ? {} : { isPrimary: true }) },
    select: { studentId: true, guardianId: true, isPrimary: true, restriction: true },
  });
  const links = linkOn && family.length
    ? await tx.parentLink.findMany({ where: { guardianId: { in: [...new Set(family.map((f) => f.guardianId))] }, status: "ACTIVE" }, select: { id: true, guardianId: true } })
    : [];
  const linkOf = new Map(links.map((l) => [l.guardianId, l.id]));
  const gateways = new Map<string, boolean>();
  const onlineFor = async (classId: string | null) => {
    if (!opts.online) return false;
    const k = classId ?? "";
    if (!gateways.has(k)) gateways.set(k, Boolean(await gatewayFor(tx, ctx, classId)));
    return gateways.get(k)!;
  };

  for (const r of rows) {
    const online = await onlineFor(r.classId);
    const mine = family.filter((f) => f.studentId === r.studentId);
    // A guardian with a custody restriction does not see this child on Parent Link, so it is not offered to them.
    const withLink = mine.filter((f) => linkOf.has(f.guardianId) && !f.restriction);
    for (const g of withLink) {
      const way: PayWay = online ? "parent-link" : "parent-link-counter";
      const ph = placeholderFor(linkOf.get(g.guardianId)!);
      plan.perGuardianStudent[`${g.guardianId}:${r.studentId}`] = { link: ph, how_to_pay: howToPay(way, ph) };
      plan.guardianWays.set(`${g.guardianId}:${r.studentId}`, way);
    }
    const others = mine.length === 0 || mine.some((f) => !withLink.includes(f));
    let way: PayWay = "counter";
    let values: PayValues = { link: NO_LINK, how_to_pay: COUNTER_WORDS };
    if (online && others) {
      if (!opts.makeLinks) {
        const ph = payPlaceholderFor(ctx.schoolId, PREVIEW_LINK_ID);
        way = "pay-link";
        values = { link: ph, how_to_pay: howToPay(way, ph, new Date(Date.now() + LINK_DAYS * 86_400_000)) };
      } else {
        try {
          const primary = mine.find((f) => f.isPrimary) ?? mine[0];
          const made = await createPaymentLink(tx, ctx, { studentId: r.studentId, dueIds: r.dueIds, guardianId: primary?.guardianId ?? null, source: "LINK", channel: "reminder", reuseOpen: true });
          const ph = payPlaceholderFor(ctx.schoolId, made.link.id);
          way = "pay-link";
          values = { link: ph, how_to_pay: howToPay(way, ph, made.link.expiresAt) };
        } catch (e) {
          // Nothing payable online (less than ₹1, or the gateway was switched off just now): the office.
          if (!(e instanceof MoneyProblem)) throw e;
        }
      }
    }
    plan.perStudent[r.studentId] = values;
    plan.ways.set(r.studentId, way);
  }
  return plan;
}
