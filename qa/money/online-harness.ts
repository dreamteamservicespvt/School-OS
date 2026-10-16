// QA harness for the online-payment path in School A (CEMS), where there is no Razorpay account
// and the server cannot reach Razorpay. Uses the app's own code with a stand-in for Razorpay:
//   on    — record a passing connection test (stand-in tester) and switch the demo gateway on
//   link  — make a Parent Link payment link for Ananya Reddy (Demo) and start Checkout (stand-in order)
//   off   — switch the demo gateway off again
//   npx tsx --conditions=react-server --env-file=.env qa/money/online-harness.ts on|link|off
import { prisma, withSchool } from "../../src/lib/db";
import { setGatewayActive, testGateway } from "../../src/lib/payments/gateways";
import { createPaymentLink, startCheckout } from "../../src/lib/fees/online";

const SCHOOL_A = "fbe1c0d0-cc45-4512-908c-70436e3fd47f";
const ANANYA = "f1bda690-4658-4866-b6fc-78412b605a65";
const ctx = { schoolId: SCHOOL_A, userId: null };
const step = process.argv[2];
const gw = await withSchool(ctx, (tx) => tx.paymentGatewayAccount.findFirstOrThrow({ where: { archivedAt: null, displayName: "Razorpay (Demo test keys)" } }));

const fakeFetch = (async (_url: string, init?: RequestInit) => {
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  return new Response(JSON.stringify({ id: `order_QA${Date.now()}`, amount: body.amount, currency: "INR", status: "created" }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const out = await withSchool(ctx, async (tx) => {
  if (step === "on") {
    await testGateway(tx, ctx, gw.id, async () => ({ ok: true, checks: [{ label: "Stand-in for Razorpay (QA)", ok: true, note: "No Razorpay account in this environment." }] }));
    return setGatewayActive(tx, ctx, gw.id, true, gw.displayName).then((g) => ({ active: g.isActive }));
  }
  if (step === "off") return setGatewayActive(tx, ctx, gw.id, false, gw.displayName).then((g) => ({ active: g.isActive }));
  const made = await createPaymentLink(tx, ctx, { studentId: ANANYA, dueIds: [], source: "PARENT_LINK" });
  const start = await startCheckout(tx, ctx, made.token, { fetchImpl: fakeFetch });
  return { linkId: made.link.id, token: made.token, orderId: start.orderId, amountPaise: start.amountPaise, gatewayId: gw.id };
}, { timeout: 60_000 });
console.log(JSON.stringify(out));
await prisma.$disconnect();
process.exit(0);
