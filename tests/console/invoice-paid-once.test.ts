// A DREAM TEAM invoice is paid once (security audit run-1 lead): Razorpay can
// send payment_link.paid twice at the same moment, and the Owner can mark an
// invoice paid by bank while the webhook arrives. Each read the invoice as
// Unpaid in its own transaction before either wrote it, so message credits
// (or top-up students) were added twice. The invoice is now claimed inside
// the paying transaction, only while it is still Unpaid.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
import type { SuperAdminUser } from "@prisma/client";
import { withConsole, withConsoleSchool, withSchool } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { actorOf } from "@/lib/console/auth";
import { addDays, istDay, markPaid, paidByRazorpay } from "@/lib/console/billing";
import { makeSchool, PASSWORD } from "../helpers";

let owner: SuperAdminUser;
const today = () => istDay(new Date());

async function schoolWithCard(name: string) {
  const s = await makeSchool(name);
  await withConsoleSchool(s.id, (tx) => tx.consoleSchool.create({ data: { id: s.id, code: s.code, name: s.name, city: "Nagpur", state: "Maharashtra", status: "ACTIVE", statusSince: new Date(), startedAs: "ACTIVE" } }));
  return s;
}

/** An Unpaid credit-pack invoice with a Razorpay link. */
async function creditInvoice(schoolId: string) {
  const linkId = `plink_${randomUUID().slice(0, 12)}`;
  const inv = await withConsole((tx) => tx.platformInvoice.create({
    data: {
      number: `T/${randomUUID().slice(0, 8)}`, forSchoolId: schoolId, kind: "CREDITS", items: [{ label: "Message credits: 4,000", qty: 4000, ratePaise: "50", amountPaise: "200000" }],
      subtotalPaise: 200_000n, gstPaise: 36_000n, totalPaise: 236_000n, issuedOn: today(), dueOn: addDays(today(), 7), status: "UNPAID", sentAt: new Date(), razorpayLinkId: linkId,
    },
  }));
  return { inv, linkId };
}

const creditLines = (schoolId: string, number: string) =>
  withSchool({ schoolId, userId: null }, (tx) => tx.creditLedgerEntry.findMany({ where: { note: { contains: number } } }));

beforeAll(async () => {
  owner = await withConsole(async (tx) => tx.superAdminUser.create({ data: { name: `Owner ${randomUUID().slice(0, 4)}`, phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, role: "OWNER", status: "ACTIVE", passwordHash: await hashPassword(PASSWORD) } }));
});

describe("a DREAM TEAM invoice is paid once", () => {
  it("two Razorpay confirmations at the same moment add the credits once", async () => {
    const s = await schoolWithCard("Paid Twice Webhook School");
    const { inv, linkId } = await creditInvoice(s.id);
    const results = await Promise.all([
      paidByRazorpay(linkId, "pay_A", 236_000),
      paidByRazorpay(linkId, "pay_A", 236_000),
      paidByRazorpay(linkId, "pay_A", 236_000),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && !r.already)).toHaveLength(1);
    expect(await creditLines(s.id, inv.number)).toHaveLength(1);
  });

  it("the Owner marking it paid while Razorpay confirms it adds the credits once", async () => {
    const s = await schoolWithCard("Paid Twice Bank School");
    const { inv, linkId } = await creditInvoice(s.id);
    const results = await Promise.allSettled([
      markPaid(actorOf(owner), inv.id, { via: "BANK", ref: "UTR99887766", receivedOn: today() }),
      paidByRazorpay(linkId, "pay_B", 236_000),
    ]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    expect(await creditLines(s.id, inv.number)).toHaveLength(1);
    const after = await withConsole((tx) => tx.platformInvoice.findUniqueOrThrow({ where: { id: inv.id } }));
    expect(after.status).toBe("PAID");
  });
});
