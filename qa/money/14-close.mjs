// Close the day (cash short by ₹100, with reason), check a back-dated entry is refused, then the Principal reopens it.
//   node qa/money/14-close.mjs close|backdate|reopen
import { as, visit, sql, SCHOOL_A, result, shot } from "./m.mjs";
import { close } from "../lib.mjs";

const M = "Finance Management", P = "Day Book";
const step = process.argv[2];
const closes = () => sql(`select id, date, expected_cash_paise, counted_cash_paise, difference_reason, reopened_at is not null from day_close where school_id='${SCHOOL_A}' order by closed_at desc limit 1`)[0];
const toast = async (page) => (await page.locator("[role=status], [role=alert]").allInnerTexts()).join(" ").replace(/\s+/g, " ").slice(0, 300);

if (step === "close") {
  const page = await as("cems.accountant");
  await visit(page, "/finance-management/day-book?do=close");
  const d = page.getByRole("dialog").last();
  const text = (await d.innerText()).replace(/\s+/g, " ");
  console.log("SHEET", text.slice(0, 700));
  await shot(page, "close-day-sheet");
  const expected = Number(await d.locator("input[name=counted]").getAttribute("placeholder"));
  await d.locator("input[name=counted]").fill(String(expected - 100));
  await page.waitForTimeout(500);
  await d.locator("textarea[name=reason]").fill("Demo: ₹100 short, change given twice");
  const msgsBefore = sql(`select count(*) from notification where school_id='${SCHOOL_A}'`)[0]?.[0];
  await d.getByRole("button", { name: "Close the day" }).click();
  await page.waitForTimeout(5000);
  const c = closes();
  const msgsAfter = sql(`select count(*) from notification where school_id='${SCHOOL_A}'`)[0]?.[0];
  result({ module: M, page: P, action: "Close the day with cash ₹100 short and a reason", role: "accountant", expected: "Day closed; difference −₹100 kept with the reason; Principal told", actual: `${await toast(page)} | ${JSON.stringify(c)} | notifications ${msgsBefore}->${msgsAfter}`, status: c && Number(c[2]) - Number(c[3]) === 10000 && /short/.test(c[4] ?? "") ? "PASS" : "FAIL" });
}
if (step === "backdate") {
  const page = await as("cems.accountant");
  const c = closes();
  await visit(page, "/finance-management/income?do=new");
  const d = page.getByRole("dialog").last();
  await d.locator("input[name=amount]").fill("1500");
  await d.locator("input[name=date]").fill(c[1]);
  const hs = d.locator("select[name=accountHeadId]");
  await hs.selectOption(await hs.locator("option").evaluateAll((os) => os.find((o) => o.textContent.startsWith("Hall rent"))?.value));
  await d.locator("input[name=receivedFrom]").fill("Demo Lions Club");
  await d.locator("input[name=note]").fill("Demo hall rent, back-dated").catch(() => {});
  const before = sql(`select count(*) from day_book_entry where school_id='${SCHOOL_A}' and date='${c[1]}'`)[0][0];
  await d.getByRole("button", { name: "Post to Day Book" }).click();
  await page.waitForTimeout(5000);
  const after = sql(`select count(*) from day_book_entry where school_id='${SCHOOL_A}' and date='${c[1]}'`)[0][0];
  const words = (await d.innerText().catch(() => "")).replace(/\s+/g, " ").match(/[^.]*(closed|locked)[^.]*\./i)?.[0] ?? (await toast(page));
  result({ module: M, page: "Income", action: `Post income dated ${c[1]} after that day is closed`, role: "accountant", expected: "Refused in plain words; nothing added to the closed day", actual: `${words} | entries on that day ${before}->${after}`, status: before === after ? "PASS" : "FAIL" });
}
if (step === "reopen") {
  const page = await as("cems.principal");
  await visit(page, "/finance-management/day-book?do=reopen&day=" + closes()[1]);
  const d = page.getByRole("dialog").last();
  if (!(await d.count())) {
    console.log((await page.locator("main").innerText()).slice(0, 800));
  }
  await d.locator("textarea[name=reason]").fill("Demo: recount after the cash box was checked");
  await d.getByRole("button", { name: "Reopen the day" }).click();
  await page.waitForTimeout(4000);
  const c = closes();
  result({ module: M, page: P, action: "Principal reopens the closed day with a reason", role: "principal", expected: "Reopened; accountant told", actual: `${await toast(page)} | reopened=${c[5]}`, status: c[5] === "t" ? "PASS" : "FAIL" });
}
await close();
