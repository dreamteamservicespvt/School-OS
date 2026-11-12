// Self-test B item 4: a fast double click / double tap on "Collect" must make ONE payment and ONE receipt.
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-B-doubletap.mjs <studentId> <amount> <desk|phone>
import { asB, go, mainText, close, sleep, PHONE, DESK, snap, rec } from "./selftest-B-h.mjs";
const [sid, amt, size] = process.argv.slice(2);
const p = await asB("accountant", size === "phone" ? PHONE : DESK);
await go(p, `/fee-management/collect/${sid}`); await sleep(1500);
const a = p.locator("#pay-amt");
await a.fill(""); await a.pressSequentially(amt, { delay: 10 });
await p.getByRole("radio", { name: "Cash", exact: true }).click();
const b = p.getByRole("button", { name: /^Collect ₹/ }).first();
await b.scrollIntoViewIfNeeded();
const box = await b.boundingBox();
const x = box.x + box.width / 2, y = box.y + box.height / 2;
if (size === "phone") { await p.touchscreen.tap(x, y); await p.touchscreen.tap(x, y); await sleep(60); await p.touchscreen.tap(x, y); }
else { await p.mouse.dblclick(x, y); await sleep(40); await p.mouse.click(x, y); }
await sleep(1200);
const d = p.getByRole("dialog").last();
const dt = (await d.innerText().catch(() => "")).replace(/\n+/g, " | ");
console.log("DIALOG", dt.slice(0, 300));
await sleep(5000);
await snap(p, `doubletap-${size}`);
console.log("AFTER", (await mainText(p, 600)).replace(/\n+/g, " | ").slice(0, 300));
if (p.problems.length) console.log("PROBLEMS", p.problems);
await close();
