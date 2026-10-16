// MONEY-10 helper: the part of the online-payment path that needs Razorpay (making an order) is done
// with the app's own code and a stand-in for Razorpay's order API, as qa/money/online-harness.ts did.
// No real Razorpay call, no real key.  Steps:
//   on <studentId>   switch the demo gateway on (stand-in connection test) and make a link + order
//   off              switch the demo gateway off again
//   npx tsx --conditions=react-server --env-file=.env qa/regression/money10-harness.ts on|off [studentId]
import { prisma, withSchool } from "../../src/lib/db";
import { setGatewayActive, testGateway } from "../../src/lib/payments/gateways";
import { createPaymentLink, startCheckout } from "../../src/lib/fees/online";

const SCHOOL_A = "fbe1c0d0-cc45-4512-908c-70436e3fd47f";
const ctx = { schoolId: SCHOOL_A, userId: null };
const [step, studentId] = process.argv.slice(2);
const gw = await withSchool(ctx, (tx) => tx.paymentGatewayAccount.findFirstOrThrow({ where: { archivedAt: null, displayName: "Razorpay (Demo test keys)" } }));
const fakeFetch = (async (_url: string, init?: RequestInit) => {
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  return new Response(JSON.stringify({ id: `order_QAREG${Date.now()}`, amount: body.amount, currency: "INR", status: "created" }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const out = await withSchool(ctx, async (tx) => {
  if (step === "off") return setGatewayActive(tx, ctx, gw.id, false, gw.displayName).then((g) => ({ active: g.isActive }));
  const wasActive = gw.isActive;
  if (!wasActive) {
    await testGateway(tx, ctx, gw.id, async () => ({ ok: true, checks: [{ label: "Stand-in for Razorpay (QA regression)", ok: true, note: "No Razorpay account in this environment." }] }));
    await setGatewayActive(tx, ctx, gw.id, true, gw.displayName);
  }
  const made = await createPaymentLink(tx, ctx, { studentId, dueIds: [], source: "PARENT_LINK" });
  const start = await startCheckout(tx, ctx, made.token, { fetchImpl: fakeFetch });
  return { wasActive, token: made.token, orderId: start.orderId, amountPaise: start.amountPaise, gatewayId: gw.id };
}, { timeout: 60_000 });
console.log(JSON.stringify(out));
await prisma.$disconnect();
process.exit(0);
