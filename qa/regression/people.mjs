// Regression re-test of the fixed PEOPLE defects, through the screens.
//   QA_OUT=qa-output/regression node qa/regression/people.mjs [ID ...]
import { as, open, settle, mainText, shot, close, squeeze, rec, check, BASE } from "./_lib.mjs";
import { writeFileSync } from "node:fs";

const only = process.argv.slice(2);
const want = (id) => !only.length || only.includes(id);
const A = "people";
const tag = String(Date.now()).slice(-5);
const phone = () => `98765${String(Math.floor(10000 + Math.random() * 89999))}`.slice(0, 10);

/** Fills Add student and presses Add student. Returns { saved, url, text }. */
async function addStudent(p, over = {}) {
  await open(p, "/student-management/new");
  await p.locator("input[name=fullName]").waitFor();
  const { section, ...rest } = over;
  const v = { fullName: `Demo QA Regress ${tag}`, dateOfBirth: "2016-05-12", guardianName: `Demo QA Parent ${tag}`, guardianPhone: phone(), ...rest };
  for (const [k, val] of Object.entries(v)) await p.locator(`[name=${k}]`).fill(val);
  const sec = p.locator("select[name=sectionId]");
  const id = await sec.evaluate((el, want) => ([...el.options].find((o) => o.text.startsWith(want)) ?? [...el.options].find((o) => o.value))?.value, section ?? "Grade 5 A ");
  await sec.selectOption(id);
  await p.locator("input[name=gender][value=Male]").check();
  const fee = p.getByLabel("Apply class fee plan");
  if (!(await fee.isChecked())) await fee.check();
  await p.locator("form").filter({ has: p.locator("input[name=fullName]") }).getByRole("button", { name: "Add student" }).click();
  await p.waitForURL(/students\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {});
  await settle(p);
  const saved = /students\/[0-9a-f-]{36}/.test(p.url());
  return { saved, url: p.url(), text: squeeze(await mainText(p, 2500)), name: v.fullName };
}

let added; // the student added by PEOPLE-10, reused by PEOPLE-24

// PEOPLE-10 (P1): Add student saves.
if (want("PEOPLE-10") || want("PEOPLE-24")) await check({ id: "PEOPLE-10", area: A, role: "cems.admin", check: "Add student with every main field valid saves and opens the profile" }, async (set) => {
  const p = set(await as("cems.admin"));
  const r = await addStudent(p);
  const s = await shot(p, "PEOPLE-10-added", false);
  if (r.saved) added = { url: r.url, id: r.url.match(/students\/([0-9a-f-]{36})/)[1], name: r.name };
  return { status: r.saved && !/Required/.test(r.text.slice(0, 300)) ? "PASS" : "FAIL", note: r.saved ? `saved ${r.name}: ${r.text.slice(0, 160)}` : `not saved, screen: ${r.text.slice(0, 300)}`, shot: s };
});

// PEOPLE-24 (P1): the new student gets the class fee plan.
if (want("PEOPLE-24") || want("PEOPLE-10")) await check({ id: "PEOPLE-24", area: A, role: "cems.accountant", check: "Student added with 'Apply class fee plan' on has the Grade 5 fee plan in the Student Fee Ledger" }, async (set) => {
  if (!added) return { status: "BLOCKED", note: "PEOPLE-10 did not add a student" };
  const p = set(await as("cems.accountant"));
  await open(p, `/fee-management/ledger/${added.id}`);
  const t = squeeze(await mainText(p, 4000));
  const s = await shot(p, "PEOPLE-24-ledger");
  const notOpen = /could not open|not here/i.test(t);
  const due = t.match(/(Total due|Due|Balance|Outstanding)[^₹]{0,30}₹[\d,]+/i)?.[0];
  const hasRows = /₹\s?[1-9][\d,]*/.test(t) && !/No fees|no fee plan/i.test(t);
  return { status: !notOpen && hasRows ? "PASS" : "FAIL", note: `${added.name}: ledger ${notOpen ? "did not open" : "opened"}; ${due ?? ""} :: ${t.slice(0, 350)}`, shot: s };
});

// PEOPLE-11 (P3): roll number 0 refused. PEOPLE-12 (P3): class kept after a failed save.
if (want("PEOPLE-11")) await check({ id: "PEOPLE-11", area: A, role: "cems.admin", check: "Add student with roll number 0 is refused with a plain message" }, async (set) => {
  const p = set(await as("cems.admin"));
  const r = await addStudent(p, { fullName: `Demo QA Roll Zero ${tag}`, rollNo: "0" });
  const s = await shot(p, "PEOPLE-11-roll0", false);
  const msg = r.text.match(/Roll number[^.]*\./i)?.[0] ?? "";
  return { status: !r.saved && /roll/i.test(msg) ? "PASS" : "FAIL", note: r.saved ? `SAVED with roll 0: ${r.url}` : `refused: "${msg || r.text.slice(0, 200)}"`, shot: s };
});
if (want("PEOPLE-12")) await check({ id: "PEOPLE-12", area: A, role: "cems.admin", check: "After a failed Add student save (5-digit phone) the class box still shows Grade 5 A" }, async (set) => {
  const p = set(await as("cems.admin"));
  const r = await addStudent(p, { fullName: `Demo QA Keep Class ${tag}`, guardianPhone: "98765" });
  const chosen = await p.locator("select[name=sectionId]").evaluate((el) => el.options[el.selectedIndex]?.text ?? "");
  await p.locator("select[name=sectionId]").evaluate((e) => e.scrollIntoView({ block: "center" }));
  const help = squeeze(await p.getByText(/of \d+ seats left/).first().innerText().catch(() => ""));
  const s = await shot(p, "PEOPLE-12-class-kept", false);
  return { status: !r.saved && chosen.startsWith("Grade 5 A") ? "PASS" : "FAIL", note: `${r.saved ? "SAVED (unexpected)" : "refused"}; class box shows "${chosen}" (help under it: "${help}"); screen: ${r.text.match(/10 digits[^.]*\.?/)?.[0] ?? ""}`, shot: s };
});

// PEOPLE-01 (P3), PEOPLE-02 (P4): import lists every problem of a row; the result follows the file's order.
if (want("PEOPLE-01") || want("PEOPLE-02")) {
  const { default: ExcelJS } = await import("exceljs");
  const file = `qa-output/regression/import-${tag}.xlsx`;
  const dd = (i) => `${String(1 + i).padStart(2, "0")}-03-2015`;
  const rows = [];
  for (let i = 1; i <= 12; i++) rows.push({ "Full name": `Demo QA Import ${tag} ${String(i).padStart(2, "0")}`, Class: "Grade 6", Section: "B", "Date of birth": dd(i), Gender: i % 2 ? "Male" : "Female", "Father's or guardian's name": `Demo QA ImpParent ${tag} ${i}`, Relation: "Father", "Parent's phone": `98765${String(30000 + Number(tag) % 900 * 10 + i).slice(-5)}` });
  rows.splice(5, 0, { "Full name": `Demo QA Import Bad ${tag}`, Class: "Grade 6", Section: "B", "Date of birth": "", Gender: "Female", "Father's or guardian's name": `Demo QA ImpParent ${tag} bad`, Relation: "Father", "Parent's phone": "12345" });
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Students");
  ws.columns = Object.keys(rows[0]).map((c) => ({ header: c, key: c, width: 22 }));
  for (const r of rows) ws.addRow(r);
  await wb.xlsx.writeFile(file);
  let p2;
  await check({ id: "PEOPLE-01", area: A, role: "cems.admin", check: "Import a row with an empty birth date and parent phone 12345: both problems are listed" }, async (set) => {
    const p = set(await as("cems.admin"));
    await open(p, "/student-management/import");
    await p.setInputFiles('input[type="file"]', file);
    await p.getByRole("button", { name: /upload and continue/i }).click();
    await p.waitForURL((u) => !u.pathname.endsWith("/import"), { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(3000);
    await p.getByRole("button", { name: /check|continue|next/i }).last().click();
    await p.waitForTimeout(8000); await settle(p);
    const t = squeeze(await mainText(p, 8000));
    const s = await shot(p, "PEOPLE-01-import-check");
    const row = t.match(new RegExp(`Demo QA Import Bad ${tag}.{0,260}`))?.[0] ?? "";
    const both = /birth/i.test(row) && /(phone|mobile|digits)/i.test(row);
    p2 = p; set(null);
    return { status: both ? "PASS" : "FAIL", note: row ? `row says: ${row.slice(0, 260)}` : `row not found; screen: ${t.slice(0, 400)}`, shot: s };
  });
  if (p2) await check({ id: "PEOPLE-02", area: A, role: "cems.admin", check: "Import 12 good rows (Grade 6 B): the result lists them in the file's order" }, async (set) => {
    const p = set(p2);
    await p.getByRole("button", { name: /^Import \d+ students/ }).click();
    await p.waitForTimeout(15000); await settle(p);
    const t = squeeze(await mainText(p, 12000));
    const s = await shot(p, "PEOPLE-02-import-result");
    const order = [...t.matchAll(new RegExp(`Demo QA Import ${tag} (\\d\\d)`, "g"))].map((m) => m[1]);
    const seen = [...new Set(order)];
    const sorted = seen.length === 12 && seen.every((x, i) => Number(x) === i + 1);
    const skipped = new RegExp(`Demo QA Import Bad ${tag}.{0,200}`).exec(t)?.[0] ?? "";
    return { status: sorted ? "PASS" : "FAIL", note: `order on screen: ${seen.join(",")} ; skipped row: ${skipped.slice(0, 200)} ; url ${p.url().replace(BASE, "")}`, shot: s };
  });
}

// Finds a student's id through the Students list search (as a person would).
async function studentId(p, name) {
  await open(p, `/student-management?q=${encodeURIComponent(name)}`);
  const href = await p.locator("main a[href*='/student-management/students/']").filter({ hasText: name }).first().getAttribute("href");
  return href.match(/students\/([0-9a-f-]{36})/)[1];
}
const REG = process.env.REG_STUDENT ?? "Demo QA Regress 61783"; // the student PEOPLE-10 added in Grade 5 A
const toastOf = async (p) => squeeze((await p.locator("[role=status], [role=alert]").allInnerTexts().catch(() => [])).join(" | "));

// PEOPLE-05 (P3): consent code message says messages are not set up, not that the number is wrong.
if (want("PEOPLE-05")) await check({ id: "PEOPLE-05", area: A, role: "cems.admissions", check: "New application from enquiry Demo Chinni Suresh: 'Send one-time code' names the real reason (no messaging), not the number" }, async (set) => {
  const p = set(await as("cems.admissions"));
  await open(p, "/admission-management/enquiries?q=Demo%20Chinni");
  await p.locator("main").getByText("Demo Chinni Suresh", { exact: true }).filter({ visible: true }).first().click({ force: true });
  await p.waitForTimeout(1500);
  const na = p.getByRole("link", { name: /New application|Start application|Application/ }).filter({ hasNotText: /^Applications$/ }).first();
  if (await na.isVisible().catch(() => false)) await na.click(); else await open(p, "/admission-management/applications/new?enquiry=bc0f5eb3-9baf-4d50-8153-397d9ab1c6ea");
  await p.waitForURL(/applications\/new/, { timeout: 20000 }); await settle(p);
  const send = p.getByRole("button", { name: "Send one-time code" });
  await send.scrollIntoViewIfNeeded();
  const disabled = await send.isDisabled();
  if (disabled) return { status: "FAIL", note: "Send one-time code is disabled (phone not filled from the enquiry?)" };
  await send.click();
  await p.waitForTimeout(4000);
  const msg = squeeze(await p.locator("p[role=status]").allInnerTexts().then((a) => a.join(" | ")));
  const s = await shot(p, "PEOPLE-05-consent-code", false);
  const blamesNumber = /(this|the) (number|mobile)|valid mobile|not a valid/i.test(msg) && !/not set up|switched on|not connected|no (sms|whatsapp)/i.test(msg);
  const ok = !!msg && !blamesNumber && /(not set up|switched on|not connected|SMS|WhatsApp|messag)/i.test(msg);
  return { status: ok ? "PASS" : "FAIL", note: `after Send one-time code: "${msg}". The application itself still cannot be saved without the code (PEOPLE-06, needs SMS/WhatsApp).`, shot: s };
});

// PEOPLE-22 (P2): Admitted page is honest that the Parent Links were not sent.
if (want("PEOPLE-22")) await check({ id: "PEOPLE-22", area: A, role: "cems.admissions", check: "Admission Decision > Admitted page of APP/2026/0001 says 'Parent Link made, not sent', not 'Parent Link sent'" }, async (set) => {
  const p = set(await as("cems.admissions"));
  await open(p, "/admission-management/applications?stage=ADMITTED");
  await p.locator("main").getByText("APP/2026/0001", { exact: true }).filter({ visible: true }).first().click({ force: true });
  await p.waitForURL(/applications\/[0-9a-f-]{36}/); await settle(p);
  const id = p.url().match(/applications\/([0-9a-f-]{36})/)[1];
  await open(p, `/admission-management/decision/${id}/admitted`);
  const t = squeeze(await mainText(p, 3000));
  const s = await shot(p, "PEOPLE-22-admitted", false);
  const line = t.match(/Parent Link[^.]*\.[^.]*\./)?.[0] ?? "";
  const ok = /Parent Link made, not sent/.test(t) && !/Parent Link sent/.test(t);
  return { status: ok ? "PASS" : "FAIL", note: `"${line}". Only the page after admission was re-checked: a new confirmation could not be done because no new application can be saved without the consent code (PEOPLE-06).`, shot: s };
});

// PEOPLE-21, PEOPLE-20, PEOPLE-08: need an application at the test, interview or papers stage.
if (want("PEOPLE-21") || want("PEOPLE-20") || want("PEOPLE-08")) await check({ id: "PEOPLE-21", area: A, role: "cems.admissions", check: "Applications waiting for a test, interview or papers exist to re-test PEOPLE-21, -20 and -08" }, async (set) => {
  const p = set(await as("cems.admissions"));
  await open(p, "/admission-management/applications");
  const t = squeeze(await mainText(p, 3000));
  const n = Number(t.match(/All stages (\d+)/)?.[1] ?? 0);
  const waiting = t.match(/Admitted (\d+)/)?.[1];
  const s = await shot(p, "PEOPLE-21-applications", false);
  const note = `Applications: ${n} in all, ${waiting} admitted, none at test, interview or papers. A new application cannot be saved in CEMS without the guardian's one-time consent code, which needs SMS or WhatsApp (PEOPLE-06).`;
  for (const id of ["PEOPLE-20", "PEOPLE-08"]) rec({ id, area: A, role: "cems.admissions", check: id === "PEOPLE-20" ? "Schedule test sheet defaults to tomorrow 9:30" : "Remind about missing papers names the real reason (no channel)", status: "NEEDS EXTERNAL CREDENTIAL", note, shot: s });
  return { status: "NEEDS EXTERNAL CREDENTIAL", note: `Interview booking honesty not re-tested. ${note}`, shot: s };
});

// PEOPLE-13 (P2): needs a phone confirmed on Parent Link with a one-time code.
if (want("PEOPLE-13")) rec({ id: "PEOPLE-13", area: A, role: "cems.admin", check: "Changing a guardian's mobile signs out phones confirmed through the old number", status: "NEEDS EXTERNAL CREDENTIAL", note: "A phone must first confirm Parent Link with a one-time code sent by SMS/WhatsApp; no channel is connected and codes are not read from the database or logs." });

// PEOPLE-15 (P3): first Parent Link says "on its way", not "sent again".
if (want("PEOPLE-15")) await check({ id: "PEOPLE-15", area: A, role: "cems.admin", check: `First Parent Link for ${REG}'s parent: message says 'on its way', not 'sent again'` }, async (set) => {
  const p = set(await as("cems.admin"));
  const sid = await studentId(p, REG);
  await open(p, `/student-management/students/${sid}`);
  await p.locator("main a[href*='/student-management/guardians/']").filter({ hasText: /Demo QA Parent/ }).first().click();
  await p.waitForURL(/guardians\/[0-9a-f-]{36}/); await settle(p);
  const before = squeeze(await mainText(p, 1500)).match(/Parent Link (Not sent|Active|Revoked)[^A-Z]*/)?.[0] ?? "";
  await p.getByRole("button", { name: /Resend Parent Link|Send Parent Link/ }).first().click();
  await p.waitForTimeout(800);
  await p.locator("dialog[open]").getByRole("button", { name: /^Send to/ }).click();
  await p.waitForTimeout(4000);
  const toast = await toastOf(p);
  const s = await shot(p, "PEOPLE-15-first-link", false);
  // CEMS has no channel: the link cannot go at all. The "on its way" words need a channel, so repeat in Sunrise (test-mode WhatsApp).
  await p.context().close();
  const q = set(await as("admin"));
  const r = await addStudent(q, { fullName: `Demo QA PL ${tag}`, guardianName: `Demo QA PL Parent ${tag}`, section: "Grade 5 A " });
  if (!r.saved) return { status: "FAIL", note: `CEMS: "${toast.slice(0, 160)}"; Sunrise: could not add the Demo student to send a first link: ${r.text.slice(0, 200)}`, shot: s };
  await q.locator("main a[href*='/student-management/guardians/']").filter({ hasText: /Demo QA PL Parent/ }).first().click({ force: true });
  await q.waitForURL(/guardians\/[0-9a-f-]{36}/); await settle(q);
  const before2 = squeeze(await mainText(q, 1500)).match(/Parent Link (Not sent|Active|Revoked)/)?.[0] ?? "";
  await q.getByRole("button", { name: /Resend Parent Link|Send Parent Link/ }).first().click();
  await q.waitForTimeout(800);
  await q.locator("dialog[open]").getByRole("button", { name: /^Send to/ }).click();
  await q.waitForTimeout(4000);
  const toast2 = await toastOf(q);
  const s2 = await shot(q, "PEOPLE-15-first-link-sunrise", false);
  const ok = /on its way/i.test(toast2) && !/sent again/i.test(toast2) && !/sent again/i.test(toast);
  return { status: ok ? "PASS" : "FAIL", note: `CEMS (no channel), before "${before.trim()}": "${toast.slice(0, 160)}". Sunrise (admin, test-mode WhatsApp), new Demo QA PL ${tag}, before "${before2}": "${toast2.slice(0, 200)}". The guardian page's button reads "Resend Parent Link" although none was sent before.`, shot: s2 };
});

// PEOPLE-16 (P3): Send Message preview does not promise channels that are not connected.
if (want("PEOPLE-16")) await check({ id: "PEOPLE-16", area: A, role: "cems.principal", check: "Send Message to Grade 5 A parents (App notice, nothing connected): preview says they will not get it" }, async (set) => {
  const p = set(await as("cems.principal"));
  await open(p, "/communication");
  const main = p.locator("main");
  await main.locator("button", { hasText: /^Sections$/ }).first().click();
  await p.waitForTimeout(800);
  await main.getByRole("button", { name: /^Grade 5 A/ }).or(main.locator("label", { hasText: /^Grade 5 A/ })).first().click();
  await p.waitForTimeout(800);
  await p.locator("input[name=title]").fill("Demo QA: regression preview only");
  await p.locator("textarea[name=text]").fill("Demo QA message: preview only, not sent.");
  await p.waitForTimeout(2500);
  const t = squeeze(await main.innerText());
  const sec = t.match(/3\. Check and send.{0,600}/)?.[0] ?? t.slice(-600);
  const s = await shot(p, "PEOPLE-16-preview", false);
  const promises = /they get WhatsApp, SMS or email/i.test(sec);
  const honest = /will not get it|not connected/i.test(sec);
  return { status: !promises && honest ? "PASS" : "FAIL", note: `preview (not sent): ${sec.slice(0, 400)}`, shot: s };
});

// PEOPLE-14 (P3): Message History marks test-mode messages (Sunrise has sandbox messaging).
if (want("PEOPLE-14")) await check({ id: "PEOPLE-14", area: A, role: "admin (Sunrise School Admin)", check: "Communication > Message History in a test-mode school shows the test-mode warning and count" }, async (set) => {
  const p = set(await as("admin"));
  await open(p, "/communication/history");
  const t = squeeze(await mainText(p, 4000));
  const s = await shot(p, "PEOPLE-14-history", false);
  const ok = /Some messages were sent in test mode/.test(t) && /in test mode/.test(t);
  let detail = "";
  const first = p.locator("main a[href*='/communication/history/']").first();
  if (await first.count()) { await first.click({ force: true }); await settle(p); detail = squeeze(await mainText(p, 1500)).match(/Test mode: not really sent\.?.{0,80}/)?.[0] ?? "(no banner on this message)"; }
  return { status: ok ? "PASS" : "FAIL", note: `list: ${t.match(/Delivered.{0,80}/)?.[0] ?? ""} | ${t.match(/Some messages were sent in test mode.{0,120}/)?.[0] ?? "no test-mode warning"} | first message: ${detail}`, shot: s };
});

// PEOPLE-17 (P3): appointment booked with confirmation on, no channel: the receptionist is told.
if (want("PEOPLE-17")) await check({ id: "PEOPLE-17", area: A, role: "cems.reception", check: "Front Office > Appointments > Book with 'Send confirmation' on: says the confirmation was not sent" }, async (set) => {
  const p = set(await as("cems.reception"));
  await open(p, "/front-office/appointments?do=book");
  await p.waitForTimeout(1500);
  const sheet = p.locator("dialog[open]").last();
  const slot = sheet.locator("#bk-time button[aria-pressed]").first();
  const slotLabel = squeeze(await slot.innerText().catch(() => "none"));
  await slot.click();
  await sheet.locator("input[name=visitorPhone]").fill("9876503177");
  await sheet.locator("input[name=visitorName]").fill(`Demo QA Visitor ${tag}`);
  await sheet.locator("input[name=purpose]").fill("Demo QA: regression appointment");
  const conf = await sheet.getByText(/confirmation/i).first().innerText().catch(() => "");
  await sheet.locator("button[type=submit]").last().click();
  await p.waitForTimeout(4000);
  const toast = await toastOf(p);
  const s = await shot(p, "PEOPLE-17-booked", false);
  const ok = /Booked/.test(toast) && /confirmation was not sent/i.test(toast);
  return { status: ok ? "PASS" : "FAIL", note: `slot ${slotLabel}; switch "${squeeze(conf).slice(0, 60)}"; screen: "${toast.slice(0, 300)}"`, shot: s };
});

// PEOPLE-18 (P4): "and N more" birthdays can be opened.
if (want("PEOPLE-18")) await check({ id: "PEOPLE-18", area: A, role: "cems.principal", check: "Dashboard Birthdays this week: 'and N more' opens and shows the rest" }, async (set) => {
  const p = set(await as("cems.principal"));
  await open(p, "/dashboard");
  const more = p.getByRole("button", { name: /and \d+ more/ }).or(p.locator("summary", { hasText: /and \d+ more/ })).first();
  if (!(await more.count())) {
    const t = squeeze(await mainText(p, 20000));
    const b = t.match(/Birthdays.{0,300}/)?.[0] ?? "no birthdays panel";
    return { status: /and \d+ more/.test(b) ? "FAIL" : "BLOCKED", note: `no openable 'and N more': ${b}`, shot: await shot(p, "PEOPLE-18-birthdays") };
  }
  const label = squeeze(await more.innerText());
  const panel = more.locator("xpath=ancestor::*[contains(., 'Birthdays')][1]");
  const beforeT = squeeze(await panel.innerText());
  await more.click(); await p.waitForTimeout(800);
  const afterT = squeeze(await panel.innerText());
  await more.scrollIntoViewIfNeeded().catch(() => {});
  const s = await shot(p, "PEOPLE-18-birthdays-open", false);
  const n = Number(label.match(/(\d+)/)[1]);
  const gained = afterT.length > beforeT.length + 10;
  return { status: gained ? "PASS" : "FAIL", note: `"${label}" (${n}) opened: ${afterT.slice(0, 400)}`, shot: s };
});

// PEOPLE-19 (P4): early pickup "Other" reason keeps its capitals in the class teacher's note.
if (want("PEOPLE-19")) await check({ id: "PEOPLE-19", area: A, role: "cems.reception + cems.classteacher", check: `Release ${REG} early with reason Other 'Demo QA Pickup ${tag}': class teacher's note keeps the capitals` }, async (set) => {
  const r = set(await as("cems.reception"));
  const sid = await studentId(r, REG);
  await open(r, `/front-office/pickup?student=${sid}`);
  const form = r.locator("form").filter({ has: r.locator("input[name=guardianId]") });
  await form.getByRole("radio", { name: /Demo QA Parent/ }).click();
  await r.waitForTimeout(1200);
  await form.getByRole("checkbox").first().click();
  await form.getByRole("radio", { name: "Other", exact: true }).click();
  const reason = `Demo QA Pickup ${tag}`;
  await form.locator("input[name=otherReason]").fill(reason);
  await form.locator("button[type=submit]").last().click({ timeout: 8000 });
  await r.waitForURL(/gp=/, { timeout: 15000 }).catch(() => {});
  const gp = squeeze(await mainText(r, 1500)).match(/GP-\d{4}-\d+/)?.[0];
  await r.context().close();
  if (!gp) return { status: "FAIL", note: "no gate pass made after Release", shot: await shot(r, "PEOPLE-19-release").catch(() => undefined) };
  const t = set(await as("cems.classteacher"));
  await open(t, "/notifications");
  const all = squeeze(await mainText(t, 6000));
  const line = all.match(new RegExp(`${REG}[^.]*leaves early[^:]*: [^.]*${tag}`, "i"))?.[0] ?? all.match(new RegExp(`.{0,120}${tag}`))?.[0] ?? "";
  const s = await shot(t, "PEOPLE-19-note", false);
  return { status: line.includes(reason) ? "PASS" : "FAIL", note: `gate pass ${gp}; note: "${line || "not found in notifications: " + all.slice(0, 200)}"`, shot: s };
});

await close();
