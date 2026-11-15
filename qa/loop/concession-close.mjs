// Layman loop 2 follow-up: does the New concession sheet close after "Apply concession"?
//   MSYS_NO_PATHCONV=1 node qa/loop/concession-close.mjs <studentId> [phone]
import path from "node:path";
import { newPage, sleep, close } from "../full/h.mjs";
import { OUTA } from "../layman/nc-h.mjs";

const [student, phone] = process.argv.slice(2);
const vp = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const p = await newPage(vp, { storageState: path.join(OUTA, "state-accountant.json") });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.split("\n")[0].slice(0, 160)));
const urls = [];
p.on("framenavigated", (f) => { if (f === p.mainFrame()) urls.push(new URL(f.url()).search || "(none)"); });
await p.goto(`http://localhost:3000/fee-management/concessions?do=new&student=${student}`, { timeout: 90000 });
await p.waitForLoadState("networkidle").catch(() => {});
const dlg = p.locator("dialog[open]");
console.log("sheet open at start:", await dlg.count(), p.url());
await p.screenshot({ path: path.resolve("qa-output/loop/concession-start.png") });
await p.locator('input[name="value"]').first().fill("100");
const head = p.locator('input[name="feeHeadId"]').first();
if (!(await head.isChecked().catch(() => true))) await head.check().catch(() => {});
await p.locator('textarea[name="reason"], input[name="reason"]').first().fill("Loop check: small sibling help");
await p.getByRole("button", { name: "Apply concession" }).click();
for (const s of [1, 3, 6]) {
  await sleep(s === 1 ? 1000 : 2000 * (s === 3 ? 1 : 1.5));
  console.log(`after ${s}s: sheet open=${await dlg.count()} url=${new URL(p.url()).search || "(none)"} alert=${(await p.locator('[role=alert]').allInnerTexts()).join(" / ").slice(0, 200)}`);
}
console.log("navigations:", urls.join(" -> "));
await p.screenshot({ path: path.resolve("qa-output/loop/concession-close.png"), fullPage: false });
if (errs.length) console.log("page errors:", errs.join(" | "));
await close();
