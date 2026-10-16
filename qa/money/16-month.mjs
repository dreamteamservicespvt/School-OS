// Month close: May cannot close before April; April 2026 (no entries) is closed; income dated April is then refused.
import { as, visit, sql, SCHOOL_A, result } from "./m.mjs";
import { close } from "../lib.mjs";

const M = "Finance Management";
const page = await as("cems.accountant");
const toast = async () => (await page.locator("[role=status], [role=alert]").allInnerTexts()).join(" ").replace(/\s+/g, " ").slice(0, 250);
const closed = () => sql(`select to_char(month,'YYYY-MM') from period_close where school_id='${SCHOOL_A}' order by month`).map((r) => r[0]);

await visit(page, "/finance-management/settings?close=2026-05");
let d = page.getByRole("dialog").last();
const t = (await d.innerText().catch(() => "")).replace(/\s+/g, " ");
const btn = d.getByRole("button", { name: /^Close May/ });
const disabled = (await btn.count()) ? await btn.isDisabled() : true;
if (!disabled) { await btn.click(); await page.waitForTimeout(3000); }
result({ module: M, page: "Finance Settings", action: "Close May 2026 while April is open", role: "accountant", expected: "Refused: months close in order", actual: `${t.match(/Close [^.]*first[^.]*\./)?.[0] ?? t.slice(0, 160)} ${disabled ? "(button disabled)" : await toast()} | closed=${closed()}`, status: !closed().includes("2026-05") ? "PASS" : "FAIL" });

if (!closed().includes("2026-04")) {
  await visit(page, "/finance-management/settings?close=2026-04");
  d = page.getByRole("dialog").last();
  await d.getByRole("button", { name: /^Close April/ }).click();
  await page.waitForTimeout(4000);
  result({ module: M, page: "Finance Settings", action: "Close April 2026 (no entries)", role: "accountant", expected: "Closed and listed as closed", actual: `${await toast()} | closed=${closed()}`, status: closed().includes("2026-04") ? "PASS" : "FAIL" });
}

await visit(page, "/finance-management/income?do=new");
d = page.getByRole("dialog").last();
await d.locator("input[name=amount]").fill("900");
await d.locator("input[name=date]").fill("2026-04-20");
const hs = d.locator("select[name=accountHeadId]");
await hs.selectOption(await hs.locator("option").evaluateAll((os) => os.find((o) => o.textContent.startsWith("Scrap sale"))?.value));
await d.locator("input[name=receivedFrom]").fill("Demo Scrap Dealer");
const before = sql(`select count(*) from income where school_id='${SCHOOL_A}'`)[0][0];
await d.getByRole("button", { name: "Post to Day Book" }).click();
await page.waitForTimeout(4000);
const after = sql(`select count(*) from income where school_id='${SCHOOL_A}'`)[0][0];
const words = (await page.getByRole("dialog").last().innerText().catch(() => "")).replace(/\s+/g, " ").match(/[^.]*(closed|April)[^.]*\./i)?.[0] ?? await toast();
result({ module: M, page: "Income", action: "Post income dated 20-04-2026 after April is closed", role: "accountant", expected: "Refused in plain words; nothing saved", actual: `${words} | income rows ${before}->${after}`, status: before === after && /closed/i.test(words) ? "PASS" : "FAIL" });
await close();
