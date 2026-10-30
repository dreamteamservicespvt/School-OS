// Delivery audit 2026-10-31: Collect Fee called directly by people who may not collect fees,
// and the same request sent twice / at once by the Accountant (double click, two tabs).
//   MSYS_NO_PATHCONV=1 node qa/full/probe-collect.mjs
import { capture, replay } from "./replay.mjs";
import { close } from "./h.mjs";

const STUDENT = process.argv[2] ?? "588fa2d9-3245-4cdc-8623-0216f157444c"; // Siddharth Chowdary, Sunrise
const caught = await capture("accountant", `/fee-management/collect/${STUDENT}`, async (p) => {
  await p.locator("#pay-amt").fill("1000");
  await p.getByRole("button", { name: /^Collect ₹/ }).click();
});
console.log("captured", caught.url, caught.headers["next-action"]?.slice(0, 10), caught.body.length, "bytes");

const verdict = (r) => {
  const t = r.text;
  if (/received\. Receipt/.test(t)) return "COLLECTED";
  if (/collected at .* Collect again\?/.test(t)) return "DUPLICATE-WARNING";
  if (/paid or changed a moment ago/.test(t)) return "ROWS-CHANGED";
  return (t.match(/"message":"([^"]{0,140})/)?.[1] ?? t.replace(/\s+/g, " ").slice(0, 160));
};
for (const who of [null, "teacher", "subjectteacher", "librarian", "reception", "viceprincipal", "driver"]) {
  const r = await replay(caught, who);
  console.log(`${who ?? "(no session)"}\t${r.status}\t${r.location ?? ""}\t${verdict(r)}`);
}
// Double submit: the Accountant's request twice in a row, then twice at the same moment.
const a1 = await replay(caught, "accountant");
const a2 = await replay(caught, "accountant");
console.log("accountant 1st", verdict(a1), "| 2nd", verdict(a2));
const [c1, c2] = await Promise.all([replay(caught, "accountant"), replay(caught, "accountant")]);
console.log("accountant together", verdict(c1), "|", verdict(c2));
await close();
