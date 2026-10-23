// Workflow 4: Defaulters, a call note with a Promise to Pay, a reminder by hand, the bulk preview.
//   node qa/e2e/money/07-defaulters.mjs <step> [viewport]
// steps: list | note | switch | promise | after | remind | bulk
import { as, visit, text, shot, sql, one, layoutIssues, VIEWPORTS, BASE, note, squeeze } from "./h.mjs";
import { close } from "../../lib.mjs";

const step = process.argv[2] ?? "list";
const vpName = process.argv[3] ?? "laptop1280";
const NAME = process.env.WHO ?? "Sahithi Verma";
const STUDENT = process.env.STU ?? "c07a2c71-fc6c-42f7-8c61-bb7c0c3309ed";
const page = await as(process.env.LOGIN ?? "accountant", VIEWPORTS[vpName]);
const tag = `${vpName}`;

async function findRow() {
  await visit(page, `/fee-management/defaulters?q=${encodeURIComponent(NAME)}`, 2000);
  return page.locator("tr, li, [role=row]").filter({ hasText: NAME }).first();
}
async function openWho() {
  const row = await findRow();
  await row.getByRole("link", { name: `Open ${NAME}` }).first().click();
  await page.waitForTimeout(2500);
  return page.locator("dialog[open], [role=dialog]").last();
}

if (step === "list") {
  await visit(page, "/fee-management/defaulters", 2500);
  note("LIST:", (await text(page, 1800)));
  note("layout", JSON.stringify(await layoutIssues(page)));
  await shot(page, `defaulters-${tag}`);
  // Filters: class, days late.
  for (const sel of await page.locator("select").all()) {
    const opts = (await sel.locator("option").allInnerTexts()).slice(0, 12);
    note("filter options:", (await sel.getAttribute("name")) ?? (await sel.getAttribute("aria-label")), opts.join(" | "));
  }
  const row = await findRow();
  note("ROW:", squeeze(await row.innerText()));
  await visit(page, "/fee-management/defaulters?q=zzzz-nobody", 1500);
  note("EMPTY SEARCH:", (await text(page, 1500)).slice(-300));
}

if (step === "note") {
  const sheet = await openWho();
  note("SHEET:", squeeze(await sheet.innerText()).slice(0, 1500));
  await shot(page, `defaulters-who-${tag}`, false);
  // Empty note.
  await sheet.getByRole("button", { name: /^Save/ }).click();
  await page.waitForTimeout(2000);
  note("EMPTY NOTE:", squeeze(await sheet.innerText()).slice(0, 400));
  await sheet.locator("textarea[name=note]").fill("Called father, he will come on Saturday. " + "x".repeat(0));
  await sheet.locator("input[name=promisedOn]").fill("2026-10-24");
  await sheet.getByRole("button", { name: /^Save/ }).click();
  await page.waitForTimeout(3000);
  note("NOTE SAVED (promise off):", (await page.locator("[role=status], [data-sonner-toast], [role=alert]").allInnerTexts()).join(" | "), squeeze(await sheet.innerText().catch(() => "closed")).slice(0, 500));
  note("DB:", JSON.stringify(sql(`select note, promised_on, promise_state, promised_paise from fee_call_note where student_id='${STUDENT}' order by created_at`)));
}

if (step === "switch") {
  await visit(page, "/fee-management/settings", 2000);
  const sw = page.getByRole("switch", { name: "Promise to pay" }).or(page.getByLabel("Promise to pay")).first();
  note("switch found:", await sw.count(), "checked:", await sw.getAttribute("aria-checked").catch(() => "?"));
  if (await sw.count() && (await sw.getAttribute("aria-checked")) !== "true") {
    await sw.click();
    await page.waitForTimeout(1500);
    const dlg = page.locator("dialog[open], [role=dialog]").last();
    if (await dlg.count()) { note("DIALOG:", squeeze(await dlg.innerText()).slice(0, 300)); await dlg.getByRole("button", { name: /Switch on|Turn on|Yes|Save/ }).last().click(); }
    await page.waitForTimeout(2500);
  }
  note("after:", await sw.getAttribute("aria-checked").catch(() => "?"), JSON.stringify(sql(`select feature_key, is_on from school_feature where feature_key='fee-promises'`)));
}

if (step === "promise") {
  const owed = one(`select sum(balance_paise) from student_fee_due where student_id='${STUDENT}' and state='OPEN'`);
  note("owes in all (paise):", owed);
  const cases = [
    ["date 61+ days away", { date: "2026-12-25", amount: "" }],
    ["date in the past", { date: "2026-10-01", amount: "" }],
    ["amount more than owed", { date: "2026-10-25", amount: "999999" }],
    ["amount zero", { date: "2026-10-25", amount: "0" }],
    ["amount with comma and rupee", { date: "2026-10-25", amount: "₹5,000" }],
  ];
  for (const [what, c] of cases) {
    const sheet = await openWho();
    await sheet.locator("textarea[name=note]").fill("");
    await sheet.locator("input[name=promisedOn]").fill(c.date);
    if (await sheet.locator("input[name=amount]").count()) await sheet.locator("input[name=amount]").fill(c.amount);
    else note("(no amount field: Promise to pay is off?)");
    await sheet.getByRole("button", { name: /^Save/ }).click();
    await page.waitForTimeout(3000);
    const msgs = (await page.locator("[role=status], [data-sonner-toast], [role=alert], [id$=-error], .text-bad").allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    note(`PROMISE ${what}: ${msgs.join(" | ").replace(/\s+/g, " ").slice(0, 400)}`);
    note("   DB:", JSON.stringify(sql(`select promised_on, promise_state, promised_paise, left(note,70) from fee_call_note where student_id='${STUDENT}' order by created_at desc limit 1`)));
    await shot(page, `promise-${tag}-${what.replace(/\W+/g, "_")}`, false);
  }
}

if (step === "after") {
  await visit(page, "/fee-management/defaulters", 2500);
  const t = await text(page, 60000);
  const idx = t.indexOf(NAME);
  note(`LIST: ${NAME} at char ${idx} of ${t.length}:`, t.slice(Math.max(0, idx - 60), idx + 260));
  const rows = await page.locator("tbody tr").allInnerTexts();
  note("row position:", rows.findIndex((r) => r.includes(NAME)), "of", rows.length, "| last rows:", rows.slice(-2).map((r) => r.replace(/\s+/g, " ").slice(0, 120)).join(" || "));
  await visit(page, `/fee-management/ledger/${STUDENT}`, 2000);
  const lt = await text(page, 3000);
  note("LEDGER promise:", (lt.match(/.{0,80}[Pp]romise.{0,120}/g) ?? ["(none)"]).join(" || "));
  await shot(page, `promise-ledger-${tag}`);
  await visit(page, "/fee-management/dashboard", 2500);
  const dt = await text(page, 12000);
  note("DASH promises:", (dt.match(/Promises to pay.{0,200}/) ?? ["(none)"])[0]);
}

if (step === "remind") {
  const row = await findRow();
  const box = row.getByRole("checkbox").first();
  if (await box.count()) await box.check(); else note("no checkbox on the row");
  await page.waitForTimeout(800);
  const btn = page.getByRole("button", { name: /Send reminder to 1|Send reminder/ }).first();
  note("send button:", squeeze(await btn.innerText()));
  await btn.click();
  await page.waitForTimeout(3500);
  const dlg = page.locator("dialog[open], [role=dialog]").last();
  note("REMINDER SHEET:", squeeze(await dlg.innerText()).slice(0, 1500));
  await shot(page, `remind-sheet-${tag}`, false);
  const before = one(`select count(*) from fee_reminder where student_id='${STUDENT}'`);
  const send = dlg.getByRole("button", { name: /^Send/ }).last();
  note("send disabled:", await send.isDisabled());
  if (!(await send.isDisabled())) {
    await send.click();
    await page.waitForTimeout(5000);
    note("AFTER SEND:", (await page.locator("[role=status], [data-sonner-toast], [role=alert]").allInnerTexts()).join(" | "), squeeze(await dlg.innerText().catch(() => "closed")).slice(0, 300));
  }
  note("fee_reminder rows", before, "->", one(`select count(*) from fee_reminder where student_id='${STUDENT}'`));
  const sheet = await openWho();
  note("HISTORY:", squeeze(await sheet.innerText()).slice(0, 900));
  await shot(page, `remind-history-${tag}`, false);
}

if (step === "bulk") {
  await visit(page, "/fee-management/defaulters", 2500);
  await page.getByText(/Send reminder to all/).first().click();
  await page.waitForTimeout(5000);
  const dlg = page.locator("dialog[open], [role=dialog]").last();
  note("BULK SHEET:", squeeze(await dlg.innerText()).slice(0, 1800));
  await shot(page, `bulk-sheet-${tag}`, false);
  note("layout", JSON.stringify(await layoutIssues(page)));
  // Do NOT send to everyone: close.
  await dlg.getByRole("button", { name: /Cancel|Close/ }).first().click().catch(() => page.keyboard.press("Escape"));
}
note("problems", JSON.stringify(page.problems));
await close();
