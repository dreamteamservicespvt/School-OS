// Self-test A, area 2 (part 2): walk-in request saved, postal received then handed over, appointment
// booked then the same slot again, call log without a follow-up.
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-A-fo2.mjs
import { asRole, go, snap, ok, finish, note, close, sleep, text } from "./selftest-A-h.mjs";
const A = "front-office";
const p = await asRole("reception");
const dlg = () => p.getByRole("dialog").last();
const dt = async () => (await dlg().innerText().catch(() => "")).replace(/\n+/g, " | ");
const open = () => dlg().isVisible().catch(() => false);
const S = new Date().toISOString().slice(11, 16).replace(":", "");

if (!process.env.ONLY_APPT) {
// 1. Walk-in request
await go(p, "/front-office?do=walkin");
await sleep(2000);
await dlg().locator("#wi-from").fill(`QA Walkin ${S}`);
await sleep(800);
await dlg().locator("#wi-phone").fill("9876512345").catch(() => {});
await dlg().locator("textarea[name=request]").fill("Bonafide certificate for passport (QA test)");
await dlg().locator("select[name=department]").selectOption("Office");
const no = (await dt()).match(/REQ-\d{4}-\d+/)?.[0];
await dlg().getByRole("button", { name: "Send to department" }).dblclick();
await sleep(5000);
const w = (await dt()) + " || " + (await text(p, 4000));
note("fo2", `AFTER WALKIN: ${w.slice(0, 1500)}`);
await go(p, "/front-office");
await sleep(2000);
const desk = await text(p, 8000);
const nW = (desk.match(new RegExp(`QA Walkin ${S}`, "g")) ?? []).length;
ok(A, "walk-in request saved once with its number", nW === 1 && (!no || desk.includes(no)), `${nW} rows, number shown in form ${no}`);
await snap(p, "fo-desk-after-walkin");

// 2. Postal received -> hand over
await go(p, "/front-office/postal?do=received");
await sleep(2000);
await dlg().locator("input[name=party]").fill(`QA Courier Sender ${S}`);
await dlg().locator("select[name=for]").selectOption({ index: 1 });
await dlg().locator("select[name=courier]").selectOption({ label: "DTDC" }).catch(() => {});
await dlg().locator("input[name=trackingNo]").fill(`QA${S}777`);
await dlg().getByRole("button", { name: "Save" }).dblclick();
await sleep(4500);
note("fo2", `AFTER POSTAL: ${(await dt()).slice(0, 500)} || ${(await text(p, 2000)).slice(0, 600)}`);
await go(p, "/front-office/postal");
await sleep(2000);
let pt = await text(p, 15000);
const nP = (pt.match(new RegExp(`QA Courier Sender ${S}`, "g")) ?? []).length;
ok(A, "postal: received item saved once (double click)", nP === 1, `${nP} rows; ${(pt.match(/At the desk\n\d+/) ?? [""])[0].replace("\n", " ")}`);
await snap(p, "fo-postal-after");
const row = p.locator("main tr, main li", { hasText: `QA Courier Sender ${S}` }).first();
const ho = row.getByRole("link", { name: /Hand over/ }).or(row.getByRole("button", { name: /Hand over/ })).first();
if (await ho.isVisible().catch(() => false)) {
  await ho.click();
  await sleep(2000);
  const hb = dlg().getByRole("button", { name: /Hand over|Save|Record/ }).last();
  await hb.click();
  await sleep(1500);
  ok(A, "postal: hand over with no collector refused", (await open()) && /Collected|who|required|Enter/i.test(await dt()), (await dt()).slice(0, 250));
  await dlg().locator("#ho-who").fill("Lakshmi Rao");
  await hb.click();
  await sleep(4000);
  pt = await text(p, 15000);
  const line = pt.split("\n").slice(pt.split("\n").findIndex((l) => l.includes(`QA Courier Sender ${S}`)), pt.split("\n").findIndex((l) => l.includes(`QA Courier Sender ${S}`)) + 8).join(" | ");
  ok(A, "postal: item shows Handed over with who collected", /Handed over/.test(line), line.slice(0, 250));
} else ok(A, "postal: Hand over action on the new row", false);

}
// 3. Appointment: book tomorrow-ish, then the same slot again
await go(p, "/front-office/appointments?do=book");
await sleep(2500);
const daySel = dlg().locator("#bk-date");
const days = await daySel.locator("option").allInnerTexts();
note("fo2", `APPT DAYS: ${days.join(" / ")}; WHO: ${(await dlg().locator("#bk-who option").allInnerTexts()).join(" / ")}`);
await daySel.selectOption({ index: Math.min(1, days.length - 1) });
await sleep(2500);
const slot = dlg().locator("#bk-time button:not(.line-through)").first();
const slotText = await slot.innerText().catch(() => "");
const bookBtn = dlg().getByRole("button", { name: /^Book$/ });
await bookBtn.click();
await sleep(1500);
ok(A, "appointment: Book with nothing filled is refused", (await open()) && /required|Pick|Enter|Choose|time/i.test(await dt()), (await dt()).slice(0, 300));
if (slotText) {
  await slot.click();
  await dlg().locator("#bk-phone").fill("9876598765");
  await sleep(800);
  await dlg().locator("input[name=visitorName]").fill(`QA Appt ${S}`);
  await dlg().locator("input[name=purpose]").fill("Discuss TC for transfer (QA)");
  await bookBtn.dblclick();
  await sleep(5000);
  note("fo2", `AFTER BOOK: ${(await dt()).slice(0, 600)} || ${(await text(p, 4000)).slice(0, 1500)}`);
  await snap(p, "fo-appointments-after");
  // second time, same slot
  await go(p, "/front-office/appointments?do=book");
  await sleep(2500);
  await dlg().locator("#bk-date").selectOption({ index: Math.min(1, days.length - 1) });
  await sleep(2500);
  const free = await dlg().locator("#bk-time button:not(.line-through)").allInnerTexts();
  const taken = await dlg().locator("#bk-time button.line-through").allInnerTexts();
  ok(A, `appointment: booked slot ${slotText} is no longer free (double-booking blocked)`, !free.includes(slotText) && taken.some((x) => x.includes(slotText)), `free ${free.slice(0, 5).join(",")} taken ${taken.slice(0, 5).join(",")}`);
  await snap(p, "fo-appointment-slot-taken");
  await p.keyboard.press("Escape");
} else ok(A, "appointment: a free slot on the next day", false, (await dt()).slice(0, 300));

// 4. Call with no follow-up (the follow-up default is wrong after 11 AM: A1)
await go(p, "/front-office/enquiries?do=call");
await sleep(2000);
await dlg().locator("#cl-phone").fill("9876501234");
await sleep(1000);
await dlg().locator("#cl-name").fill(`QA Caller ${S}`);
await dlg().locator("#cl-purpose").selectOption("Fee");
await dlg().locator("textarea[name=note]").fill("Asked the fee for Class 4");
await dlg().getByRole("button", { name: /^Save/ }).last().dblclick();
await sleep(4500);
await go(p, "/front-office/enquiries?view=calls");
await sleep(2000);
const ct = await text(p, 12000);
const nC = (ct.match(new RegExp(`QA Caller ${S}`, "g")) ?? []).length;
ok(A, "call (no follow-up) saved once in the call log", nC === 1, `${nC} rows; ${(ct.match(/Calls today\n[^\n]*\n[^\n]*/) ?? [""])[0].replace(/\n/g, " ")}`);
await snap(p, "fo-calls-after");
console.log("PROBLEMS", p.problems.join(" ; "));
finish("fo2");
await close();
