// Concessions: one under the ₹1,000 limit (applies at once), one above it (Approvals).
//   node qa/e2e/money/10-concession.mjs <step>   steps: small | big | check
import { as, visit, text, shot, sql, one, VIEWPORTS, BASE, note, squeeze } from "./h.mjs";
import { close } from "../../lib.mjs";

const step = process.argv[2];
const RITHVIK = process.env.S1 ?? "e170976b-2ec0-415b-8ecc-9928532239fe", SAHITHI = process.env.S2 ?? "e90ad07b-8827-4e03-b2e0-b983a550facb";
const N1 = process.env.N1 ?? "SPS/2026/0073", N2 = process.env.N2 ?? "SPS/2026/0034";
const page = await as("accountant", VIEWPORTS.laptop1280);
const dlg = () => page.locator("dialog[open], [role=dialog]").last();
const msgs = async () => (await page.locator("[role=status], [data-sonner-toast], [role=alert], [id$=-error]").allInnerTexts()).map((x) => x.trim()).filter(Boolean).join(" | ").replace(/\s+/g, " ");

async function openFor(name) {
  await visit(page, "/fee-management/concessions", 1500);
  await page.getByRole("link", { name: "New concession" }).or(page.getByRole("button", { name: "New concession" })).first().click();
  await page.waitForTimeout(2000);
  note("STEP 1:", squeeze(await dlg().innerText().catch(() => "")).slice(0, 300) || (await text(page, 600)).slice(0, 300));
  const box = page.locator("#con-sq");
  if (await box.count()) { await box.fill(name); await page.waitForTimeout(2500); note("RESULTS:", squeeze(await dlg().innerText()).slice(0, 400)); await dlg().getByText(/Manish Mehta|Charan Menon/).first().click(); await page.waitForTimeout(2500); }
  note("SHEET:", squeeze(await dlg().innerText()).slice(0, 800));
}
async function fill({ amount, percent, reason }) {
  const ev = dlg().getByRole("button", { name: "Event fees", exact: true });
  if ((await ev.getAttribute("aria-pressed")) === "true") { await ev.click(); await dlg().getByRole("button", { name: "Tuition fee", exact: true }).click(); }
  if (percent !== undefined) { await dlg().getByRole("radio", { name: "%" }).or(dlg().getByRole("button", { name: "%" })).first().click(); await dlg().locator("input[name=value]").fill(percent); }
  if (amount !== undefined) await dlg().locator("input[name=value]").fill(amount);
  await dlg().locator("textarea[name=reason]").fill(reason ?? "");
  await dlg().getByRole("button", { name: "Apply concession" }).click();
  await page.waitForTimeout(3500);
}
const cons = (s) => JSON.stringify(sql(`select type, status, amount_paise, percent_bp, applied_paise, left(reason,50) from concession where student_id='${s}' order by created_at`));

if (step === "small") {
  await openFor(N1);
  await shot(page, "concession-sheet", false);
  await fill({ amount: "500", reason: "" });
  note("NO REASON:", await msgs());
  await fill({ amount: "500", reason: "QA: small help for books, agreed by the office" });
  note("SMALL:", await msgs(), "|", squeeze(await dlg().innerText().catch(() => "closed")).slice(0, 200));
  note("DB:", cons(RITHVIK));
}
if (step === "big") {
  await openFor(N2);
  await fill({ percent: "150", reason: "QA: percent too big" });
  note("150%:", await msgs());
  await dlg().getByRole("radio", { name: "₹" }).or(dlg().getByRole("button", { name: "₹" })).first().click();
  await fill({ amount: "2000", reason: "QA: father lost his job in September, letter seen" });
  note("BIG:", await msgs(), "|", squeeze(await dlg().innerText().catch(() => "closed")).slice(0, 200));
  note("DB:", cons(SAHITHI));
  note("approval:", JSON.stringify(sql(`select id, status, summary from approval where type='concession' order by created_at desc limit 1`)));
  await shot(page, "concession-big-after");
}
if (step === "check") {
  await visit(page, "/fee-management/concessions", 2000);
  note("LIST:", (await text(page, 3000)).slice(0, 1600));
  await shot(page, "concessions-list");
  note("RITHVIK:", cons(RITHVIK), "SAHITHI:", cons(SAHITHI));
  for (const s of [RITHVIK, SAHITHI]) {
    note("dues:", JSON.stringify(sql(`select d.label, d.amount_paise, d.concession_paise, d.adjustment_paise, d.paid_paise, d.balance_paise from student_fee_due d where student_id='${s}' and state='OPEN' and concession_paise>0`)));
  }
  await visit(page, `/fee-management/ledger/${SAHITHI}`, 2000);
  const t = await text(page, 6000);
  note("LEDGER:", (t.match(/Year total.{0,120}/) ?? [""])[0], "|", (t.match(/.{0,40}[Cc]oncession.{0,160}/g) ?? []).join(" || "));
}
note("problems", JSON.stringify(page.problems));
await close();
