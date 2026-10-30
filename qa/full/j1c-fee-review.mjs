// Journey E1, part 3: application fee at the counter (with mistakes), review, then what comes next.
//   node qa/full/j1c-fee-review.mjs <applicationId>
import { as } from "./look.mjs";
import { go, mainText, shot, saveJson, close } from "./h.mjs";

const [APP] = process.argv.slice(2);
const URL_ = `/admission-management/applications/${APP}`;
const res = [];
const rec = (check, pass, note = "") => { res.push({ check, pass, note }); console.log(`${pass ? "PASS" : "FAIL"} ${check}${note ? " :: " + note : ""}`); };
const errs = async (s) => [...new Set((await s.locator('[id$="-error"], [role="alert"]').allInnerTexts()).map((x) => x.trim()).filter(Boolean))];

const p = await as("admin");
await go(p, URL_);
await p.getByRole("button", { name: "Collect application fee" }).click();
let d = p.getByRole("dialog", { name: /Collect at the counter/ });
await d.waitFor();
const amount = d.locator("[name=amount]");
console.log("amount prefilled:", await amount.inputValue());
await amount.fill(""); await amount.pressSequentially("99999999", { delay: 10 });
await d.getByRole("button", { name: "Record payment" }).click();
await p.waitForTimeout(1500);
let e = await errs(d);
rec("A huge application fee (₹9,99,99,999) is questioned or refused", e.length > 0 || (await d.isVisible()), e.join(" / ") || "dialog still open, no message");
await amount.fill(""); await amount.pressSequentially("500", { delay: 10 });
await d.locator("[name=mode]").selectOption("UPI");
await d.getByRole("button", { name: "Record payment" }).click();
await p.waitForTimeout(1500);
e = await errs(d);
rec("UPI without a transaction ID asks for it", e.some((x) => /reference|transaction|UPI/i.test(x)), e.join(" / "));
await shot(p, "j1c-fee-upi-no-ref", false);
await d.locator("[name=reference]").pressSequentially("UPI428817263544", { delay: 10 });
await d.getByRole("button", { name: "Record payment" }).dblclick();
await p.waitForTimeout(3000);
let t = await mainText(p, 3000);
rec("Fee recorded: application shows ₹500 paid", /Paid/.test(t.match(/Application fee[\s\S]{0,40}/)?.[0] ?? ""), t.match(/Application fee[\s\S]{0,60}/)?.[0]?.replace(/\n/g, " | "));
const receipts = (t.match(/receipt/gi) ?? []).length;
console.log("receipt mentions:", receipts, "| links:", (await p.locator("main a[href*=receipt], main a[href*=pdf]").evaluateAll((as) => as.map((a) => a.getAttribute("href")))).join(" "));
await shot(p, "j1c-fee-paid", true);
// Review.
await p.getByRole("button", { name: "Review", exact: true }).click();
d = p.getByRole("dialog", { name: /Review application/ });
await d.getByRole("button", { name: "Looks right" }).click();
await d.locator("[name=note]").pressSequentially("Birth certificate and TC seen at the counter.", { delay: 5 });
await d.getByRole("button", { name: "Mark reviewed" }).click();
await p.waitForTimeout(2500);
t = await mainText(p, 3000);
rec("Application marked reviewed", /Reviewed|review/i.test(t.slice(0, 400)), t.slice(0, 300).replace(/\n/g, " | "));
console.log("BUTTONS NOW:", (await p.locator("main button, main a").allInnerTexts()).map((x) => x.trim()).filter(Boolean).slice(0, 40).join(" | "));
saveJson("j1c-fee-review.json", res);
await close();
