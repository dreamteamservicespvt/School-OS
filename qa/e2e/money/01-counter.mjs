// Workflow 2, fee collection at the counter, as the Sunrise Accountant.
//   node qa/e2e/money/01-counter.mjs <step> [viewport] [studentId]
// steps: search | mistakes | pay | double | back | receipt | after | cancel
import { as, visit, text, shot, sql, one, layoutIssues, VIEWPORTS, rs, SUNRISE, BASE, note } from "./h.mjs";
import { close } from "../../lib.mjs";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const step = process.argv[2] ?? "search";
const vpName = process.argv[3] ?? "laptop1280";
const STUDENT = process.argv[4] ?? "5323a56e-27dd-4d83-a914-3e95790b75a7"; // Rithvik Varma, Class 3 B
const OUTF = path.join(process.env.QA_OUT, `counter-${STUDENT.slice(0, 8)}.json`);
const mem = existsSync(OUTF) ? JSON.parse(readFileSync(OUTF, "utf8")) : {};
const save = () => writeFileSync(OUTF, JSON.stringify(mem, null, 2));
const page = await as(process.env.LOGIN ?? "accountant", VIEWPORTS[vpName]);
const tag = `${vpName}-${STUDENT.slice(0, 4)}`;

export function money(studentId = STUDENT) {
  const pays = sql(`select p.id, p.amount_paise, p.mode, p.status, coalesce(r.number,''), coalesce(p.reference,''), to_char(p.created_at,'HH24:MI:SS') from payment p left join receipt r on r.payment_id=p.id where p.student_id='${studentId}' order by p.created_at`);
  const day = sql(`select direction, amount_paise, section, source_type, coalesce(reverses_entry_id::text,'') from day_book_entry where student_id='${studentId}' order by posted_at`);
  const bal = one(`select coalesce(sum(balance_paise) filter (where state='OPEN' and due_date<=current_date+30),0) from student_fee_due where student_id='${studentId}'`);
  const msgs = one(`select count(*) from message where source_type='Payment' and source_id in (select id::text from payment where student_id='${studentId}')`);
  return { pays, day, balance: rs(bal), msgs: Number(msgs) };
}

async function openCollect() {
  await visit(page, `/fee-management/collect/${STUDENT}`, 800);
  await page.getByText("How is it paid?").waitFor({ timeout: 60000 });
}
async function fillPay({ amount, mode, ref, cheque } = {}) {
  if (mode) await page.getByRole("radio", { name: mode, exact: true }).click();
  if (amount !== undefined) await page.locator("#pay-amt").fill(String(amount));
  if (ref !== undefined) await page.locator("#pay-ref").fill(ref);
  if (cheque) {
    await page.locator("#chq-no").fill(cheque.no);
    await page.locator("#chq-bank").fill(cheque.bank);
    if (cheque.date) await page.locator("#chq-date").fill(cheque.date);
  }
}
const btnLabel = async () => (await page.getByRole("button", { name: /^Collect ₹|Saving payment/ }).first().innerText()).trim();
async function outcome() {
  for (let i = 0; i < 60; i++) {
    const dlg = page.locator("dialog[open]");
    if (await dlg.count()) return { ok: true, text: (await dlg.first().innerText()).replace(/\s+/g, " ") };
    const warn = page.getByRole("button", { name: "Collect again" });
    if (await warn.count()) return { ok: false, warned: true, text: (await page.locator("[role=alert]").allInnerTexts()).join(" | ").replace(/\s+/g, " ") };
    const errs = (await page.locator("[role=alert], [id$=-error], .text-bad").allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    if (errs.length && i > 2) return { ok: false, text: errs.join(" | ").replace(/\s+/g, " ") };
    await page.waitForTimeout(500);
  }
  return { ok: false, text: "nothing in 30 s" };
}

if (step === "search") {
  await visit(page, "/fee-management", 800);
  const box = page.locator("#fee-search");
  for (const q of ["Rithvk Varma", "rithvik", "SPS/2023/0138", "2023/0138", "7001760390", "70017 60390", "Suresh Varma", "zzqx nobody"]) {
    await box.fill(q);
    await page.waitForTimeout(2500);
    const t = await text(page, 1500);
    note(`SEARCH "${q}" -> url=${page.url().replace(BASE, "")} :: ${t.split("Fee Settings")[1]?.slice(0, 400) ?? t.slice(0, 400)}`);
    await shot(page, `search-${tag}-${q.replace(/\W+/g, "_")}`, false);
  }
  // Search in the top bar: "fee Rithvik".
  await page.keyboard.press("Control+K");
  await page.waitForTimeout(800);
  await page.keyboard.type("fee Rithvik", { delay: 40 });
  await page.waitForTimeout(2500);
  const pal = (await page.locator("[role=dialog], [role=listbox], [cmdk-root]").first().innerText().catch(() => "")).replace(/\s+/g, " ");
  note("TOPBAR fee Rithvik ->", pal.slice(0, 500));
  await shot(page, `search-topbar-${tag}`, false);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);
  note("after Enter url:", page.url().replace(BASE, ""));
  note("layout", JSON.stringify(await layoutIssues(page)), "problems", JSON.stringify(page.problems));
}

if (step === "mistakes") {
  const before = money().pays.length;
  const cases = [
    ["more than due", { amount: "50000" }],
    ["zero", { amount: "0" }],
    ["negative", { amount: "-500" }],
    ["letters", { amount: "five hundred" }],
    ["UPI without reference", { amount: "1000", mode: "UPI", ref: "" }],
    ["UPI with short reference", { amount: "1000", mode: "UPI", ref: "12" }],
    ["Cheque with no number", { amount: "1000", mode: "Cheque", cheque: { no: "", bank: "SBI" } }],
    ["Card without reference", { amount: "1000", mode: "Card", ref: "" }],
  ];
  for (const [what, o] of cases) {
    await openCollect();
    await fillPay(o);
    const label = await btnLabel();
    await page.getByRole("button", { name: /^Collect ₹/ }).click();
    await page.waitForTimeout(1500);
    const r = await outcome();
    const after = money().pays.length;
    note(`MISTAKE ${what}: button="${label}" -> ${r.ok ? "ACCEPTED" : "refused"}: ${r.text.slice(0, 250)} | payments ${before}->${after}`);
    await shot(page, `mistake-${tag}-${what.replace(/\W+/g, "_")}`, false);
  }
  for (const typed of ["12,500", "₹500", " 1500 ", "1,00,000", "500.505"]) {
    await openCollect();
    await fillPay({ amount: typed });
    note(`TYPED "${typed}" -> button "${await btnLabel()}" errors: ${(await page.locator("[id$=-error], .text-bad").allInnerTexts()).join(" | ")}`);
  }
  // Server-side check without the screen's own checks: post the form with the
  // client handler skipped (a person cannot do this; it proves the server checks too).
  await openCollect();
  await fillPay({ amount: "1000", mode: "UPI", ref: "" });
  await page.evaluate(() => { const f = document.querySelector("form"); const b = [...f.querySelectorAll("button[type=submit]")].find((x) => /^Collect/.test(x.innerText.trim())); b.dataset.plain = "1"; b.click(); });
  await page.waitForTimeout(4000);
  note("SERVER no-ref UPI:", (await page.locator("[role=alert], [id$=-error]").allInnerTexts()).join(" | "), "payments", money().pays.length);
  await openCollect();
  await fillPay({ amount: "99999" });
  await page.evaluate(() => { const f = document.querySelector("form"); const b = [...f.querySelectorAll("button[type=submit]")].find((x) => /^Collect/.test(x.innerText.trim())); b.dataset.plain = "1"; b.click(); });
  await page.waitForTimeout(4000);
  note("SERVER over-due:", (await page.locator("[role=alert], [id$=-error]").allInnerTexts()).join(" | "), "payments", money().pays.length);
  await shot(page, `mistake-${tag}-server-overdue`, false);
}

if (step === "pay") {
  const m0 = money();
  note("BEFORE", JSON.stringify(m0));
  const plan = [
    ["cash", { amount: "5000", mode: "Cash" }],
    ["upi", { amount: "3,000", mode: "UPI", ref: `UPIQA${Date.now().toString().slice(-8)}` }],
    ["cheque", { amount: "₹2000", mode: "Cheque", cheque: { no: String(100000 + (Date.now() % 899999)).slice(0, 6), bank: "SBI Ameerpet" } }],
  ];
  mem.paid = mem.paid ?? [];
  for (const [what, o] of plan) {
    await openCollect();
    await fillPay(o);
    const label = await btnLabel();
    await page.getByRole("button", { name: /^Collect ₹/ }).click();
    const r = await outcome();
    await shot(page, `pay-${tag}-${what}`, false);
    const m = money();
    note(`PAY ${what} button="${label}": ${r.ok ? "OK" : "NOT OK"} ${r.text.slice(0, 300)}`);
    note("  state:", JSON.stringify(m));
    mem.paid.push({ what, r: r.text.slice(0, 200), last: m.pays.at(-1) });
    save();
    if (r.ok) { await page.keyboard.press("Escape"); await page.waitForTimeout(800); }
  }
  note("layout", JSON.stringify(await layoutIssues(page)), "problems", JSON.stringify(page.problems));
}

if (step === "double") {
  const n0 = money().pays.length;
  await openCollect();
  await fillPay({ amount: "700", mode: "Cash" });
  await page.getByRole("button", { name: /^Collect ₹/ }).dblclick();
  const r = await outcome();
  await page.waitForTimeout(3000);
  const m = money();
  note(`DOUBLE-CLICK: ${r.ok ? "receipt" : "no receipt"} ${r.text.slice(0, 200)} | payments ${n0}->${m.pays.length}`, JSON.stringify(m.pays.slice(-3)));
  await shot(page, `double-${tag}`, false);
}

if (step === "back") {
  const n0 = money().pays.length;
  await openCollect();
  await fillPay({ amount: "600", mode: "Cash" });
  await page.getByRole("button", { name: /^Collect ₹/ }).click();
  const r1 = await outcome();
  note("FIRST:", r1.text.slice(0, 160));
  await page.goBack();
  await page.waitForTimeout(1500);
  await page.goForward().catch(() => {});
  await page.waitForTimeout(500);
  await openCollect();
  await fillPay({ amount: "600", mode: "Cash" });
  await page.getByRole("button", { name: /^Collect ₹/ }).click();
  const r2 = await outcome();
  note(`AGAIN same amount and mode: ${r2.warned ? "WARNED" : r2.ok ? "SAVED SILENTLY" : "refused"} ${r2.text.slice(0, 300)}`);
  await shot(page, `back-again-${tag}`, false);
  note("payments", n0, "->", money().pays.length);
}

if (step === "receipt") {
  const m = money();
  const posted = m.pays.filter((p) => p[3] === "POSTED");
  for (const p of posted.slice(-3)) {
    for (const suffix of ["", "?download=1"]) {
      const r = await page.request.get(`${BASE}/fee-management/payments/${p[0]}/receipt${suffix}`);
      const body = await r.body();
      note(`RECEIPT ${p[4]} ${suffix || "print"}: HTTP ${r.status()} ${r.headers()["content-type"]} ${body.length} bytes disp=${r.headers()["content-disposition"] ?? ""}`);
      if (suffix && r.ok()) writeFileSync(path.join(process.env.QA_OUT, `receipt-${p[4].replace(/\W+/g, "_")}.pdf`), body);
    }
  }
  // Payment page.
  if (posted.length) {
    await visit(page, `/fee-management/payments/${posted.at(-1)[0]}`, 1500);
    note("PAYMENT PAGE:", (await text(page, 2500)));
    await shot(page, `payment-page-${tag}`);
  }
}

if (step === "after") {
  await visit(page, `/fee-management/ledger/${STUDENT}`, 1500);
  note("LEDGER:", (await text(page, 4000)));
  await shot(page, `ledger-${tag}`);
  const payTab = page.getByRole("tab", { name: /Payments/ }).first();
  if (await payTab.count()) { await payTab.click(); await page.waitForTimeout(1500); note("LEDGER PAYMENTS:", (await text(page, 4000)).split("Statement")[1]?.slice(0, 1500)); await shot(page, `ledger-payments-${tag}`); }
  await visit(page, "/finance-management/day-book", 2000);
  const db = await text(page, 8000);
  note("DAY BOOK (head):", db.slice(0, 1500));
  note("DAY BOOK rows with Rithvik:", (db.match(/.{0,120}Rithvik Varma.{0,160}/g) ?? []).join("\n"));
  await shot(page, `daybook-${tag}`);
  await visit(page, "/fee-management/dashboard", 2000);
  const fd = await text(page, 6000);
  note("FEE DASHBOARD tiles:", fd.slice(0, 500));
  note("FEE DASHBOARD Rithvik:", (fd.match(/.{0,40}Rithvik Varma.{0,140}/g) ?? []).join("\n"));
  await visit(page, "/dashboard", 2000);
  note("DASHBOARD:", (await text(page, 2500)));
  await shot(page, `dashboard-${tag}`);
}

if (step === "cancel") {
  const m = money();
  const target = m.pays.filter((p) => p[3] === "POSTED" && p[2] === (process.env.CANCEL_MODE ?? "UPI")).at(-1);
  if (!target) { note("no payment to cancel"); await close(); process.exit(0); }
  await visit(page, `/fee-management/payments/${target[0]}`, 1500);
  const t0 = await text(page, 3000);
  note("PAYMENT PAGE before cancel:", t0.slice(0, 1200));
  note("Delete anywhere?", /delete/i.test(t0) ? "YES: " + t0.match(/.{0,60}delete.{0,60}/i)[0] : "no 'delete' word apart from notes");
  await page.getByRole("link", { name: /Cancel with a reason/ }).click();
  await page.waitForTimeout(1500);
  const sheet = page.locator("dialog[open], [role=dialog]").last();
  note("CANCEL SHEET:", (await sheet.innerText()).replace(/\s+/g, " "));
  await shot(page, `cancel-sheet-${tag}`, false);
  // Try without a reason first.
  await sheet.getByRole("button", { name: /Cancel receipt|Send for approval/ }).click();
  await page.waitForTimeout(1500);
  note("NO REASON:", (await sheet.innerText()).replace(/\s+/g, " ").slice(0, 600));
  await sheet.locator("select[name=reason]").selectOption({ label: "Wrong amount" }).catch(async () => sheet.locator("select[name=reason]").selectOption({ index: 2 }));
  await sheet.locator("textarea[name=note]").fill("QA money tester: UPI entered against wrong amount, collected again");
  await sheet.getByRole("button", { name: /Cancel receipt|Send for approval/ }).click();
  await page.waitForTimeout(4000);
  note("AFTER CANCEL page:", (await text(page, 2500)).slice(0, 1200));
  await shot(page, `cancel-after-${tag}`);
  const m2 = money();
  note("STATE before:", JSON.stringify(m));
  note("STATE after:", JSON.stringify(m2));
  note("receipt row:", JSON.stringify(sql(`select number, status, cancelled_at from receipt where payment_id='${target[0]}'`)));
  note("audit:", JSON.stringify(sql(`select action, record_type, left(coalesce(after::text,''),200), at from audit_log_entry where record_id='${target[0]}' order by at`)));
}
note("problems", JSON.stringify(page.problems));
await close();
