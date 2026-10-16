// Fee Settings as the accountant: late fee rule (with bad inputs first) and advance payments.
import { as, visit, mainText, shot, sql, SCHOOL_A, result } from "./m.mjs";
import { close } from "../lib.mjs";

const M = "Fee Management", P = "Fee Settings";
const page = await as("cems.accountant");
const setting = () => sql(`select late_fee_on, late_fee_type, late_fee_paise, grace_days, late_fee_max_paise from fee_setting where school_id='${SCHOOL_A}'`)[0]?.join(",");

async function lateFee(amount, grace, max) {
  await visit(page, "/fee-management/settings?edit=late");
  const d = page.getByRole("dialog").last();
  await d.waitFor();
  const sw = d.getByRole("switch", { name: "Add late fee" });
  if ((await sw.getAttribute("aria-checked")) !== "true") await sw.click();
  await d.locator("select[name=type]").selectOption("flat");
  await d.locator("input[name=amount]").fill(amount);
  await d.locator("input[name=graceDays]").fill(grace);
  await d.locator("input[name=max]").fill(max);
  await d.getByRole("button", { name: "Save late fee rules" }).click();
  await page.waitForTimeout(2500);
  const open = await d.isVisible().catch(() => false);
  return { open, text: open ? (await d.innerText()).replace(/\s+/g, " ").slice(0, 600) : "" };
}

for (const [a, g, why] of [["-200", "7", "negative amount"], ["200", "-3", "negative grace days"], ["200", "abc", "letters as grace days"], ["200", "99999", "grace of 99,999 days"], ["200.555", "7", "three decimals"]]) {
  const before = setting();
  const r = await lateFee(a, g, "");
  const after = setting();
  result({ module: M, page: P, action: `Late fee rule with ${why}`, role: "accountant", expected: "Refused with plain words, nothing saved", actual: r.open ? (r.text.match(/(must|Enter|cannot|between|number|Grace|at least|whole)[^.]{0,90}/i)?.[0] ?? "kept open") : `saved: ${after}`, status: r.open && before === after ? "PASS" : "FAIL" });
}
const r = await lateFee("200", "7", "500");
result({ module: M, page: P, action: "Turn on late fee: ₹200 once, 7 days grace, most ₹500", role: "accountant", expected: "Saved", actual: setting(), status: !r.open && /^t,flat,20000,7,50000/.test(setting()) ? "PASS" : "FAIL" });

// Advance payments switch
await visit(page, "/fee-management/settings");
const adv = page.getByRole("switch", { name: /Advance payments/ }).first();
if ((await adv.getAttribute("aria-checked")) !== "true") { await adv.click(); await page.waitForTimeout(2500); }
const on = sql(`select is_on from school_feature where school_id='${SCHOOL_A}' and feature_key='fee-advance'`)[0]?.[0];
result({ module: M, page: P, action: "Switch on Advance payments", role: "accountant", expected: "School Feature on", actual: `fee-advance=${on}`, status: on === "t" ? "PASS" : "FAIL" });
await shot(page, "fee-settings-after");
await close();
