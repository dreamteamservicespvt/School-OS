// Self-test B item 1 (Fee collect at phone size, light + dark) and layman mistakes (empty amount, back button).
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-B-fee-phone.mjs
import { asB, go, mainText, close, sleep, PHONE, snap, rec, phoneCheck, focusedCovered } from "./selftest-B-h.mjs";
const RUNS = process.argv[2] ? [[process.argv[2], process.argv[3]]] : [["light", "9576a2b3-40d6-4a3f-8939-4c9a127215fd"], ["dark", "f14de2f8-a086-4aef-a51f-13329bb3e478"]];
for (const [scheme, sid] of RUNS) {
  const p = await asB("accountant", PHONE, scheme);
  const url = `/fee-management/collect/${sid}`;
  await go(p, url); await sleep(1500);
  const c1 = await phoneCheck(p);
  rec(`fee ${scheme}: no sideways scroll`, c1.scrollWidth <= 390, `scrollWidth ${c1.scrollWidth} ${c1.wide.join("; ")}`);
  rec(`fee ${scheme}: tap targets >= 40px`, c1.small.length === 0, c1.small.join(", "));
  rec(`fee ${scheme}: text >= 12px`, c1.tinyText.length === 0, c1.tinyText.join(", "));
  console.log("sticky", JSON.stringify(c1.sticky));
  await snap(p, `fee-${scheme}-top`); await snap(p, `fee-${scheme}-full`, true);
  // Layman: clears the amount and presses Collect.
  const amt = p.locator("#pay-amt");
  await amt.scrollIntoViewIfNeeded(); await amt.tap(); await amt.fill("");
  const cov = await focusedCovered(p);
  rec(`fee ${scheme}: amount box not under a sticky bar`, cov?.inView && !cov?.coveredBy, JSON.stringify(cov));
  const btn = p.getByRole("button", { name: /^Collect/ }).first();
  const lbl = await btn.innerText().catch(() => "");
  const dis = await btn.isDisabled().catch(() => null);
  if (!dis) { await btn.tap().catch(() => {}); await sleep(1500); }
  const t1 = await mainText(p, 4000);
  const msg = (t1.match(/[^\n]*(Enter|amount|more than|zero)[^\n]*/gi) ?? []).slice(0, 3).join(" / ");
  rec(`fee ${scheme}: empty amount is stopped with a clear message`, dis || /Enter|amount/i.test(msg), `button "${lbl}" disabled=${dis}; ${msg}`);
  await snap(p, `fee-${scheme}-empty-amount`);
  // Real part payment in cash.
  await amt.tap(); await amt.fill(""); await amt.pressSequentially(process.argv[4] ?? "5000", { delay: 20 });
  await p.getByRole("radio", { name: "Cash", exact: true }).tap();
  await sleep(500);
  const b2 = p.getByRole("button", { name: /^Collect ₹/ }).first();
  console.log("button", await b2.innerText());
  const box = await b2.boundingBox(); console.log("collect box", JSON.stringify(box));
  await b2.tap(); await sleep(1500);
  const d = p.getByRole("dialog").last();
  if (await d.isVisible().catch(() => false)) {
    console.log("DIALOG", (await d.innerText()).replace(/\n+/g, " | ").slice(0, 400));
    await snap(p, `fee-${scheme}-confirm`);
    await d.getByRole("button", { name: /Collect|Confirm|Yes/ }).last().tap();
  }
  await sleep(5000);
  const after = (await mainText(p, 2500)).replace(/\n+/g, " | ");
  console.log("AFTER", after.slice(0, 700));
  const c2 = await phoneCheck(p);
  rec(`fee ${scheme}: payment collected, receipt shown`, /receipt|Receipt|collected|Collected/.test(after), after.slice(0, 160));
  rec(`fee ${scheme}: after screen no sideways scroll`, c2.scrollWidth <= 390, `scrollWidth ${c2.scrollWidth} ${c2.wide.join("; ")}`);
  rec(`fee ${scheme}: after screen tap targets`, c2.small.length === 0, c2.small.join(", "));
  await snap(p, `fee-${scheme}-after`); await snap(p, `fee-${scheme}-after-full`, true);
  // Layman: presses the phone's Back button after collecting.
  await p.goBack().catch(() => {}); await sleep(2500);
  const back = (await mainText(p, 1500)).replace(/\n+/g, " | ");
  console.log("BACK", new URL(p.url()).pathname, back.slice(0, 300));
  await snap(p, `fee-${scheme}-back`);
  if (p.problems.length) console.log("PROBLEMS", p.problems);
  await p.context().close();
}
await close();
