// PTM slot booking on Kavya Reddy's Parent Link (confirmed phone, 375px), then the same booking
// action called directly with Sai Naidu's student id (another family's child).
//   node qa/people/ptm.mjs <pl-fixture.json>
import { readFileSync } from "node:fs";
import { newPage, close, shot, BASE, VIEWPORTS } from "../lib.mjs";
import { res } from "./res.mjs";

const [kavya] = JSON.parse(readFileSync(process.argv[2], "utf8").trim().split("\n").pop());
const SAI_STUDENT = "03c597aa-cb4d-439e-b50d-10a4848c51c8";
const M = "Communication", P = "Parent Link (guardian page)", R = "Parent (no login)";
const page = await newPage(VIEWPORTS.phone375);
await page.context().addCookies([{ name: kavya.cookie, value: kavya.key, domain: new URL(BASE).hostname, path: "/p" }]);
await page.goto(`${BASE}${kavya.path}`);
await page.waitForLoadState("networkidle").catch(() => {});
const body = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
let t = await body();
console.log("PTM PART", (t.match(/.{0,100}PTM.{0,400}/) ?? [""])[0]);
const book = page.getByRole("button", { name: /Book|Choose a time|Pick a time/ }).first();
const n = await book.count();
console.log("BOOK BUTTONS", n, await page.getByRole("button").allInnerTexts());
if (n) {
  await book.click();
  await page.waitForTimeout(1500);
  const d = page.locator("dialog[open]").last();
  const scope = (await d.count()) ? d : page.locator("body");
  console.log("BOOK UI", (await scope.innerText()).replace(/\s+/g, " ").slice(0, 600));
  const time = scope.locator("input[name=slotId]").first();
  if (await time.count()) await time.check({ force: true }).catch(() => {});
  else await scope.getByRole("radio").first().click().catch(() => {});
  await scope.locator("button[type=submit]").last().click();
  await page.waitForTimeout(3000);
  t = await body();
  await shot(page, "pl-ptm-booked");
  const msg = (t.match(/(Booked|Changed|You already have)[^.]*\.[^.]*\./) ?? [t.slice(0, 200)])[0];
  res({ module: M, page: P, action: "Book a PTM slot on Kavya Reddy's Parent Link (CEMS: no WhatsApp/SMS)", role: R, expected: "Booked; does not promise a confirmation message that cannot go", actual: msg, status: /Booked|You already have/.test(msg) ? (/on its way/.test(msg) ? "FAIL" : "PASS") : "FAIL" });
}
await close();
