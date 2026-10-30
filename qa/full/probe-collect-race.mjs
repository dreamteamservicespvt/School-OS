// Delivery audit 2026-10-31: the same Collect Fee request sent 3 times at the same moment (two tabs / double click
// that beat the button's disabled state). Exactly one payment and one receipt must result.
//   MSYS_NO_PATHCONV=1 node qa/full/probe-collect-race.mjs <studentId>
import { capture, replay } from "./replay.mjs";
import { close } from "./h.mjs";
const STUDENT = process.argv[2];
const caught = await capture("accountant", `/fee-management/collect/${STUDENT}`, async (p) => {
  await p.locator("#pay-amt").fill(process.argv[3] ?? "1000");
  await p.getByRole("button", { name: /^Collect ₹/ }).click();
});
const rs = await Promise.all([1, 2, 3].map(() => replay(caught, "accountant")));
for (const r of rs) console.log(r.status, /Collect again\?/.test(r.text) ? "DUPLICATE-WARNING" : /moment ago/.test(r.text) ? "ROWS-CHANGED" : /"message":"([^"]{0,120})/.exec(r.text)?.[1] ?? "no message (likely success redirect/refresh)");
await close();
