// Front Office desk (cems.reception): a phone call that is an admission enquiry becomes an
// Admission Enquiry in the same step, with a follow-up; then an appointment is booked and the
// visitor arrives (visit). Admissions then sees the enquiry (cems.admissions).
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const M = "Front Office", R = "Receptionist";
const PHONE = process.env.PHONE ?? "9876503101";
const rec = await as("cems.reception");
const sheet = () => rec.locator("dialog[open]").last();
const txt = async (p, sel) => ((await p.locator(sel).allInnerTexts().catch(() => [])).join(" ")).replace(/\s+/g, " ");
const say = async () => `${await txt(rec, "dialog[open]")} || ${await txt(rec, "[role=status], [role=alert]")}`;
const tomorrow = new Date(Date.now() + 86400000 + 5.5 * 3600000).toISOString().slice(0, 10);

// 1. Log a call: admission enquiry
await go(rec, "/front-office/enquiries?do=call");
await rec.waitForTimeout(1000);
await sheet().locator("select[name=purpose]").selectOption("Admission enquiry");
await rec.waitForTimeout(400);
await sheet().locator("button[type=submit]").last().click();
await rec.waitForTimeout(1500);
let t = await say();
res({ module: M, page: "Enquiries & Calls", action: "Log a call (Admission enquiry) with nothing filled", role: R, expected: "Refused; phone, name, child and class named", actual: t.slice(0, 300), status: /phone|name|child|class/i.test(t) && !/saved/i.test(t) ? "PASS" : "FAIL" });
await sheet().locator("input[name=phone]").fill(PHONE);
await sheet().locator("input[name=name]").fill("Demo Caller Suresh");
await sheet().locator("input[name=childName]").fill("Demo Chinni Suresh");
const cls = sheet().locator("select[name=classId]");
const opts = await cls.locator("option").allInnerTexts();
await cls.selectOption({ label: opts.find((o) => /Grade 3/.test(o)) ?? opts[1] });
await sheet().locator("textarea[name=note]").fill("Demo: asked about Grade 3 seats and fees.");
await sheet().locator("#cl-fu").click();
await rec.waitForTimeout(400);
await sheet().locator("input[name=followDate]").fill(tomorrow);
const btnLabel = await sheet().locator("button[type=submit]").last().innerText();
await sheet().locator("button[type=submit]").last().click();
await rec.waitForTimeout(3500);
t = await say();
if (/already|same number|Save anyway|matches/i.test(t)) {
  console.log("DUP", t.slice(0, 300));
  await sheet().getByText(/anyway/i).first().click().catch(() => {});
  await sheet().locator("button[type=submit]").last().click();
  await rec.waitForTimeout(3500);
  t = await say();
}
const enq = (t.match(/ENQ[-/\w]+/) ?? [null])[0];
await shot(rec, "desk-call-enquiry");
res({ module: M, page: "Enquiries & Calls", action: `Log a phone call as Admission enquiry with a follow-up (button "${btnLabel.trim()}")`, role: R, expected: "Call saved and Admission Enquiry made in the same step, with an owner", actual: t.slice(0, 300), status: /Enquiry .* made in the same step/.test(t) ? "PASS" : "FAIL" });

// 2. Admissions sees it
const adm = await as("cems.admissions");
await go(adm, "/admission-management/enquiries?q=Demo%20Chinni");
await adm.waitForTimeout(1000);
const a = await txt(adm, "main");
res({ module: "Admission Management", page: "Enquiries", action: "Enquiry from the reception call appears in Admissions", role: "Admission Counsellor", expected: "Demo Chinni Suresh listed, source phone, Grade 3", actual: `${enq} ${(a.match(/.{0,80}Demo Chinni.{0,160}/) ?? [a.slice(0, 200)])[0]}`, status: /Demo Chinni Suresh/.test(a) ? "PASS" : "FAIL" });

// 3. The call is in the call log with the follow-up
await go(rec, "/front-office/enquiries?view=calls");
await rec.waitForTimeout(800);
const calls = await txt(rec, "main");
res({ module: M, page: "Enquiries & Calls", action: "Call log shows the call and its follow-up", role: R, expected: "Demo Caller Suresh listed with a follow-up date", actual: (calls.match(/.{0,60}Demo Caller Suresh.{0,160}/) ?? [calls.slice(0, 200)])[0], status: /Demo Caller Suresh/.test(calls) ? "PASS" : "FAIL" });

// 4. Book an appointment
await go(rec, "/front-office/appointments?do=book");
await rec.waitForTimeout(1500);
await sheet().locator("button[type=submit]").last().click();
await rec.waitForTimeout(1500);
t = await say();
res({ module: M, page: "Appointments", action: "Book with no slot and nothing filled", role: R, expected: "Refused: pick a free slot, phone, name, purpose", actual: t.slice(0, 300), status: /slot|phone|name|purpose/i.test(t) && !/Booked/.test(t) ? "PASS" : "FAIL" });
const who = sheet().locator("select[name=staffId]");
console.log("WITH", (await who.locator("option").allInnerTexts()).slice(0, 8));
await rec.waitForTimeout(1500);
const slot = sheet().locator("#bk-time button[aria-pressed]").first();
const slotLabel = await slot.innerText().catch(() => "none");
await slot.click().catch(() => {});
await sheet().locator("input[name=visitorPhone]").fill("9876503102");
await sheet().locator("input[name=visitorName]").fill("Demo Appointment Lakshmi");
await sheet().locator("input[name=purpose]").fill("Demo: TC enquiry");
await sheet().locator("button[type=submit]").last().click();
await rec.waitForTimeout(3500);
t = await say();
await shot(rec, "desk-appointment-booked");
res({ module: M, page: "Appointments", action: `Book Demo Appointment Lakshmi at ${slotLabel} (confirmation on, no SMS/WhatsApp connected)`, role: R, expected: "Booked; does not claim a confirmation was sent", actual: t.slice(0, 300), status: /Booked/.test(t) && !/Confirmation sent/.test(t) ? "PASS" : /Booked/.test(t) ? "FAIL" : "FAIL" });

// 5. Mark arrived -> visitor pass
await go(rec, "/front-office/appointments");
await rec.waitForTimeout(1000);
const arrive = rec.locator("main").getByRole("link", { name: /Mark arrived/ }).first();
if (await arrive.count()) {
  await arrive.click();
  await rec.waitForTimeout(1500);
  console.log("ARRIVE SHEET", (await txt(rec, "dialog[open]")).slice(0, 500));
  await sheet().locator("button[type=submit]").last().click();
  await rec.waitForTimeout(3500);
  t = await say();
  res({ module: M, page: "Appointments", action: "Mark the appointment arrived", role: R, expected: "Visitor pass made and the person to meet told", actual: t.slice(0, 300), status: /arrived|pass V-/i.test(t) ? "PASS" : "FAIL" });
} else {
  const m = await txt(rec, "main");
  res({ module: M, page: "Appointments", action: "Mark the appointment arrived", role: R, expected: "Mark arrived offered for the booked appointment", actual: m.slice(0, 300), status: "BLOCKED" });
}
console.log(rec.problems, adm.problems);
await close();
