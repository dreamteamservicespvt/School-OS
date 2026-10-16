// Regression re-test of MONEY-06 (change a sent-back expense) and MONEY-01 (pay twice from two tabs),
// through the Expenses screens.  QA_OUT=qa-output/regression node qa/regression/money-expense.mjs
import { as, open, settle, mainText, shot, close, squeeze, rec, check, page, BASE } from "./_lib.mjs";

const A = "money";
const tag = String(Date.now()).slice(-5);
const WHAT = `Demo QA regress repair ${tag}`;
const sheetText = async (p) => squeeze(await p.getByRole("dialog").last().innerText().catch(() => ""));
const toastOf = async (p) => squeeze((await p.locator("[role=status], [role=alert]").allInnerTexts().catch(() => [])).join(" | "));

async function openExpense(p) {
  await open(p, "/finance-management/expenses");
  const href = await p.locator(`main a[href*='open=']`).filter({ hasText: WHAT }).first().getAttribute("href");
  const id = href.match(/open=([0-9a-f-]{36})/)[1];
  await open(p, `/finance-management/expenses?open=${id}`);
  await p.getByRole("dialog").last().waitFor();
  return id;
}
let id, number;
let ready = false;

await check({ id: "MONEY-06", area: A, role: "cems.accountant + cems.principal", check: "An expense sent back by the Principal can be changed (Change) and sent again" }, async (set) => {
  const acc = set(await as("cems.accountant"));
  // 1. Record ₹6,200 with a bill photo: above the limit, so it waits for approval.
  await open(acc, "/finance-management/expenses?do=new");
  const d = acc.getByRole("dialog").last();
  await d.locator("input[name=amount]").fill("6200");
  await d.locator("input[name=what]").fill(WHAT);
  { const s = d.locator("select[name=accountHeadId]"); const v = await s.locator("option").evaluateAll((os) => (os.find((o) => o.textContent.startsWith("Repairs")) ?? os.find((o) => o.value))?.value); await s.selectOption(v); }
  await d.locator("input[name=vendorName]").fill(`Demo QA Vendor ${tag}`);
  const bill = "qa-output/regression/demo-bill.png";
  await acc.screenshot({ path: bill, clip: { x: 0, y: 0, width: 300, height: 200 } });
  await d.locator("#exp-bill").setInputFiles(bill);
  const sendBtn = d.getByRole("button", { name: /Send to/ });
  const sendLabel = squeeze(await sendBtn.innerText());
  await sendBtn.click();
  await acc.waitForTimeout(4000);
  id = await openExpense(acc);
  const s0 = await sheetText(acc);
  number = s0.match(/EXP\/[\d-]+\/\d+/)?.[0] ?? "";
  if (!/Waiting/i.test(s0)) return { status: "BLOCKED", note: `expense did not go for approval ("${sendLabel}"): ${s0.slice(0, 200)}` };
  await acc.context().close();
  // 2. Principal sends it back with a reason.
  const pr = set(await as("cems.principal"));
  await open(pr, `/finance-management/expenses?open=${id}`);
  await pr.getByRole("dialog").last().getByRole("link", { name: "Reject" }).click();
  await pr.waitForTimeout(1500);
  const rd = pr.getByRole("dialog").last();
  await rd.locator("textarea[name=reason]").fill("Demo QA: attach the bill and correct the amount");
  await rd.getByRole("button", { name: "Send back" }).click();
  await pr.waitForTimeout(3500);
  const backMsg = await toastOf(pr);
  await pr.context().close();
  // 3. Accountant opens it: Change is offered; change the amount and send again.
  const a2 = set(await as("cems.accountant"));
  await open(a2, `/finance-management/expenses?open=${id}`);
  const sd = a2.getByRole("dialog").last();
  const s1 = await sheetText(a2);
  const btns = (await sd.getByRole("link").allInnerTexts()).concat(await sd.getByRole("button").allInnerTexts()).map(squeeze).filter(Boolean);
  const change = sd.getByRole("link", { name: /^Change/ });
  if (!(await change.count())) return { status: "FAIL", note: `${number} sent back ("${backMsg.slice(0, 100)}"); sheet offers only: ${btns.join(", ")}`, shot: await shot(a2, "MONEY-06-no-change", false) };
  await change.click();
  await a2.waitForTimeout(2000);
  const f = a2.getByRole("dialog").last();
  await f.locator("input[name=amount]").fill("5800");
  await f.locator("input[name=what]").fill(`${WHAT} (corrected)`);
  await f.getByRole("button", { name: /Save and send|Send/ }).first().click();
  await a2.waitForTimeout(4000);
  const msg = await toastOf(a2);
  await open(a2, `/finance-management/expenses?open=${id}`);
  const s2 = await sheetText(a2);
  const s = await shot(a2, "MONEY-06-after-change", false);
  const ok = /5,800/.test(s2) && /Waiting/i.test(s2);
  ready = ok;
  return { status: ok ? "PASS" : "FAIL", note: `${number}: sent back ("${backMsg.slice(0, 90)}"); sheet buttons: ${btns.join(", ")}; after Change to ₹5,800: "${msg.slice(0, 120)}"; sheet now: ${s2.slice(0, 160)}`, shot: s };
});

await check({ id: "MONEY-01", area: A, role: "cems.accountant (two tabs)", check: "Approved expense marked paid from two tabs at the same moment: one payment, one Day Book OUT" }, async (set) => {
  if (!id) return { status: "BLOCKED", note: "no expense from the MONEY-06 step" };
  const pr = set(await as("cems.principal"));
  await open(pr, `/finance-management/expenses?open=${id}`);
  const ab = pr.getByRole("dialog").last().getByRole("button", { name: /^Approve/ });
  if (await ab.count()) { await ab.click(); await pr.waitForTimeout(3500); }
  const sp = await sheetText(pr);
  await pr.context().close();
  const t1 = set(await as("cems.accountant"));
  const t2 = await t1.context().newPage();
  const tabs = [t1, t2];
  for (const p of tabs) {
    await open(p, `/finance-management/expenses?pay=${id}`);
    const d = p.getByRole("dialog").last();
    await d.getByRole("radio", { name: "Bank transfer" }).click().catch(async () => d.getByRole("button", { name: "Bank transfer" }).click());
    await d.locator("input[name=reference]").fill(`DEMOQAUTR${tag}`);
  }
  await Promise.all(tabs.map((p) => p.getByRole("dialog").last().getByRole("button", { name: /^Mark/ }).click()));
  await t1.waitForTimeout(6000);
  const said = [];
  for (const p of tabs) said.push((await toastOf(p)) || (await sheetText(p)).slice(0, 140));
  await shot(t2, "MONEY-01-tab2", false);
  // The Day Book of today and the expense itself.
  await open(t1, "/finance-management/day-book");
  const db = squeeze(await mainText(t1, 30000));
  const hits = (db.match(new RegExp(`DEMOQAUTR${tag}`, "g")) ?? []).length;
  const s = await shot(t1, "MONEY-01-daybook");
  await open(t1, `/finance-management/expenses?open=${id}`);
  const ex = await sheetText(t1);
  const payments = (ex.match(/DEMOQAUTR\d+/g) ?? []).length;
  const ok = hits === 1 && payments <= 1;
  return { status: ok ? "PASS" : "FAIL", note: `principal: ${sp.match(/Approved|Waiting|Paid/i)?.[0] ?? "?"}; tab 1: "${said[0].slice(0, 120)}"; tab 2: "${said[1].slice(0, 120)}"; Day Book today has ${hits} line(s) with bank reference DEMOQAUTR${tag} for ${number}; expense sheet shows the bank reference ${payments} time(s): ${ex.slice(0, 160)}`, shot: s };
});

await close();
