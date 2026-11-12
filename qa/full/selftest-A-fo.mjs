// Self-test A, area 2: Front Office as the Receptionist. Enquiry, call log, walk-in request, postal, appointment,
// pickup search, visitor with a wrong phone; with layman mistakes (empty save, wrong phone, double click, back).
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-A-fo.mjs
import { asRole, go, snap, ok, finish, note, close, sleep, text, pageState } from "./selftest-A-h.mjs";
const A = "front-office";
const p = await asRole("reception");
const dlg = () => p.getByRole("dialog").last();
const dt = async () => (await dlg().innerText().catch(() => "")).replace(/\n+/g, " | ");
const open = async () => dlg().isVisible().catch(() => false);
const S = new Date().toISOString().slice(11, 16).replace(":", "");
const CHILD = `Qa Child ${S}`;
const PHONE = `98${S}0${S}`.slice(0, 10);

// --- 1. New enquiry
await go(p, "/front-office/enquiries?do=enquiry");
await sleep(2000);
await snap(p, "fo-enquiry-sheet");
const send = () => dlg().getByRole("button", { name: "Send to Admissions" });
await send().click();
await sleep(1500);
ok(A, "enquiry: empty form refused with messages", (await open()) && /required|Enter|Type|Choose|Give/i.test(await dt()), (await dt()).slice(0, 300));
await dlg().getByLabel("Child’s name").fill(CHILD);
await dlg().getByLabel("Parent’s name").fill("Qa Parent");
await dlg().locator("#en-phone").fill("12345");
await dlg().getByLabel("Class wanted").selectOption({ index: 1 });
await send().click();
await sleep(2000);
ok(A, "enquiry: 5-digit phone refused", (await open()) && /phone|mobile|digit/i.test(await dt()), ((await dt()).match(/[^|]*(phone|mobile|digit)[^|]*/i) ?? [""])[0]);
await dlg().locator("#en-phone").fill(PHONE);
await send().dblclick();
await sleep(5000);
const afterEnq = (await dt()) + " || " + (await text(p, 3000));
note("fo", `AFTER ENQUIRY: ${afterEnq.slice(0, 1200)}`);
ok(A, "enquiry: saved, sheet says it went to Admissions with an owner", /Admission|owner|sent/i.test(afterEnq), (afterEnq.match(/[^|\n]*(Admission|Owner|sent)[^|\n]*/i) ?? [""])[0].slice(0, 200));
await go(p, "/front-office/enquiries");
await sleep(2000);
const reg = await text(p, 10000);
const n1 = (reg.match(new RegExp(CHILD, "g")) ?? []).length;
ok(A, "enquiry: in the register once after a double click", n1 === 1, `${n1} rows`);
ok(A, "enquiry: 'Enquiries today' counter went up", /Enquiries today\n[1-9]/.test(reg), (reg.match(/Enquiries today\n[^\n]*/) ?? [""])[0]);
await snap(p, "fo-enquiries-after");
// same phone again: duplicate warning?
await go(p, "/front-office/enquiries?do=enquiry");
await sleep(1500);
await dlg().getByLabel("Child’s name").fill(CHILD);
await dlg().getByLabel("Parent’s name").fill("Qa Parent");
await dlg().locator("#en-phone").fill(PHONE);
await dlg().getByLabel("Class wanted").selectOption({ index: 1 });
await send().click();
await sleep(4000);
const dup = (await dt()) + " || " + (await text(p, 2500));
ok(A, "enquiry: same child and phone again warns of a duplicate", /already|duplicate|same/i.test(dup), dup.slice(0, 300));
await snap(p, "fo-enquiry-duplicate");
if (await open()) await p.keyboard.press("Escape");

// --- 2. Log a call: complaint with no note, then admission enquiry with follow-up
await go(p, "/front-office/enquiries?do=call");
await sleep(2000);
await dlg().locator("#cl-phone").fill("9876501234");
await sleep(1200);
await dlg().locator("#cl-name").fill("Qa Caller");
await dlg().locator("#cl-purpose").selectOption("Complaint").catch(async () => note("fo", "no Complaint purpose"));
await sleep(500);
const callBtn = () => dlg().getByRole("button", { name: /^Save/ }).last();
await callBtn().click();
await sleep(2000);
ok(A, "call: complaint with no note refused", (await open()) && /note|complaint|required|Write/i.test(await dt()), (await dt()).slice(0, 300));
await dlg().locator("#cl-purpose").selectOption("Admission enquiry");
await sleep(500);
await dlg().getByLabel("Child’s name").fill(`${CHILD} call`);
await dlg().getByLabel("Class wanted").selectOption({ index: 2 });
await dlg().getByLabel("Note").fill("Asked about LKG seats and the bus");
await dlg().locator("#cl-fu").click();
await sleep(400);
const btnLabel = await callBtn().innerText();
ok(A, "call: save button says it also makes the enquiry", /enquiry/i.test(btnLabel), btnLabel);
await callBtn().click();
await sleep(5000);
const afterCall = (await dt()) + " || " + (await text(p, 3000));
note("fo", `AFTER CALL: ${afterCall.slice(0, 1200)}`);
await go(p, "/front-office/enquiries?tab=calls");
await sleep(2000);
const calls = await text(p, 12000);
ok(A, "call: in the call log", calls.includes("Qa Caller"), (calls.match(/Calls today\n[^\n]*/) ?? [""])[0]);
ok(A, "call: enquiry made in the same step", calls.includes(`${CHILD} call`) || (await (async () => { await go(p, "/front-office/enquiries"); await sleep(1500); return (await text(p, 12000)).includes(`${CHILD} call`); })()));
await snap(p, "fo-calls-after");

// --- 3. Walk-in request
await go(p, "/front-office?do=walkin");
await sleep(2000);
await snap(p, "fo-walkin-sheet");
const wiBtn = dlg().getByRole("button", { name: /Save|Make|Send|Create|Give/ }).last();
await wiBtn.click();
await sleep(1500);
ok(A, "walk-in: empty form refused", await open(), (await dt()).slice(0, 300));
note("fo", `WALKIN SHEET: ${(await dt()).slice(0, 1500)}`);

// --- 4. Postal: received, then hand over
await go(p, "/front-office/postal?do=received");
await sleep(2000);
const pBtn = dlg().getByRole("button", { name: "Save" });
await pBtn.click();
await sleep(1500);
ok(A, "postal: empty received item refused", (await open()) && /required|Enter|Who|From|For/i.test(await dt()), (await dt()).slice(0, 250));
note("fo", `POSTAL SHEET: ${(await dt()).slice(0, 1500)}`);
await snap(p, "fo-postal-empty");
await close();
finish("fo");
