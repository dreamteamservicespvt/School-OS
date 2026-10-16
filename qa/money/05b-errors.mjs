// What a person sees when Collect Fee refuses (field errors are not alerts).
import { as, shot, mainText } from "./m.mjs";
import { close } from "../lib.mjs";
import { collect, STU } from "./collect-lib.mjs";
const page = await as("cems.accountant");
for (const [n, o] of [["zero", { amount: "0" }], ["future", { amount: "1000", mode: "Cash", paidAt: "2026-12-01T10:00" }], ["upi-noref", { amount: "1000", mode: "UPI", ref: "" }], ["cheque4", { amount: "1000", mode: "Cheque", cheque: { no: "1234", bank: "SBI Demo", date: "2026-10-16" } }]]) {
  await collect(page, STU.vihaan, { ...o, noSubmit: true });
  const btn = page.getByRole("button", { name: /^Collect ₹/ });
  console.log(n, "button disabled:", await btn.isDisabled());
  await btn.click({ force: true, timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const errs = await page.locator("[id$=-error], .text-bad, [role=alert], [aria-invalid=true]").allInnerTexts();
  console.log(n, "errors:", JSON.stringify(errs.filter(Boolean)).slice(0, 400));
  await shot(page, `collect-error-${n}`, false);
}
await close();
