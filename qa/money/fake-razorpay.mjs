// QA only: a stand-in for Razorpay's API so the online-payment path can be
// driven without a Razorpay account. Loaded into the dev server with
//   NODE_OPTIONS="--import ./qa/money/fake-razorpay.mjs" npx next dev -p 3101
// Orders get ids "order_QA<n>"; everything else is passed through.
const real = globalThis.fetch;
let n = Date.now() % 100000;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("https://api.razorpay.com/")) {
    const path = new URL(url).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
    if (path === "/v1/orders" && init?.method === "POST") return json({ id: `order_QA${++n}`, amount: body.amount, currency: "INR", receipt: body.receipt, status: "created", notes: body.notes });
    if (path.startsWith("/v1/payments/")) return json({ id: path.split("/").pop(), status: "captured", amount: 100, currency: "INR", order_id: null, created_at: Math.floor(Date.now() / 1000) });
    return json({ items: [] });
  }
  return real(input, init);
};
