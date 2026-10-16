// After-fix checks on the dev server of this branch (QA_URL=http://localhost:3102).
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const T = async (p, sel = "main") => ((await p.locator(sel).allInnerTexts().catch(() => [])).join(" ")).replace(/\s+/g, " ");
const only = (process.env.ONLY ?? "send,birthday,admitted,appointment").split(",");
const pr = await as("cems.principal");

if (only.includes("send")) {
  await go(pr, "/communication");
  await pr.waitForTimeout(3000);
  const t = await T(pr);
  const sec = (t.match(/USERS TO NOTIFY.{0,300}/) ?? [""])[0];
  res({ module: "Communication", page: "Send Message (fixed build, dev server)", action: "Preview for whole-school parents, App notice, no WhatsApp/SMS/email connected (PEOPLE-16)", role: "Principal", expected: "Says parents without the app will not get it", actual: sec.slice(0, 300), status: /not connected, so they will not get it/.test(sec) ? "PASS" : "FAIL", defect: "PEOPLE-16" });
}
if (only.includes("birthday")) {
  await go(pr, "/dashboard");
  await pr.waitForTimeout(3000);
  const more = pr.locator("summary", { hasText: /and \d+ more/ }).first();
  let t = "";
  if (await more.count()) { await more.click(); await pr.waitForTimeout(500); t = await T(pr); }
  await shot(pr, "dev-birthdays");
  res({ module: "Dashboard", page: "Dashboard (fixed build, dev server)", action: "Open 'and N more' in Birthdays this week (PEOPLE-18)", role: "Principal", expected: "The rest open in place; Teja Varma (Tue) is there", actual: (t.match(/.{0,60}Teja Varma.{0,40}/) ?? [`summary found=${await more.count()}`])[0], status: /Teja Varma/.test(t) ? "PASS" : "FAIL", defect: "PEOPLE-18" });
}
if (only.includes("admitted")) {
  const adm = await as("cems.admissions");
  await go(adm, "/admission-management/decision/a25642f3-48be-41db-8808-d722783b7f58/admitted");
  await adm.waitForTimeout(3000);
  const t = await T(adm);
  await shot(adm, "dev-admitted");
  res({ module: "Admission Management", page: "Admission Decision (Admitted) (fixed build, dev server)", action: "Admitted page Parent Link line when the links could not go (PEOPLE-22)", role: "Admission Counsellor", expected: "Parent Link made, not sent, and what to do", actual: (t.match(/Parent Link.{0,220}/) ?? [t.slice(0, 200)])[0], status: /Parent Link made, not sent/.test(t) && !/Parent Link sent/.test(t) ? "PASS" : "FAIL", defect: "PEOPLE-22" });
}
if (only.includes("appointment")) {
  const rec = await as("cems.reception");
  await go(rec, "/front-office/appointments?do=book");
  await rec.waitForTimeout(3000);
  const sheet = rec.locator("dialog[open]").last();
  await rec.waitForTimeout(2000);
  const slot = sheet.locator("#bk-time button[aria-pressed]").first();
  const label = await slot.innerText().catch(() => "none");
  await slot.click().catch(() => {});
  await sheet.locator("input[name=visitorPhone]").fill("9876503103");
  await sheet.locator("input[name=visitorName]").fill("Demo Appointment Suneetha");
  await sheet.locator("input[name=purpose]").fill("Demo: fee query");
  await sheet.locator("button[type=submit]").last().click();
  await rec.waitForTimeout(5000);
  const t = await T(rec, "[role=status]");
  res({ module: "Front Office", page: "Appointments (fixed build, dev server)", action: `Book Demo Appointment Suneetha at ${label}, confirmation on, no WhatsApp/SMS (PEOPLE-17)`, role: "Receptionist", expected: "Booked, and says the confirmation was not sent", actual: t.slice(0, 300), status: /Booked/.test(t) && /confirmation was not sent/.test(t) ? "PASS" : "FAIL", defect: "PEOPLE-17" });
}
await close();
