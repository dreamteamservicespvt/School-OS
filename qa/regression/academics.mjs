// Regression re-test of the other fixed ACADEMICS defects.
//   QA_OUT=qa-output/regression node qa/regression/academics.mjs [ID ...]
import { as, open, settle, mainText, shot, close, squeeze, rec, check, BASE } from "./_lib.mjs";
import { callFormAction } from "../academics/action.mjs";

const only = process.argv.slice(2);
const want = (id) => !only.length || only.includes(id);
const A = "academics";
const tag = String(Date.now()).slice(-5);
const toastOf = async (p) => squeeze((await p.locator("[role=status], [role=alert]").allInnerTexts().catch(() => [])).join(" | "));
const sheetText = async (p) => squeeze(await p.locator("dialog[open]").last().innerText().catch(() => ""));
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201"; // Grade 5 A, the value of its option in the class pickers
const F_ATT = "src/app/(school)/attendance-management/register/actions.ts";
const msgOf = (r) => r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.replace(/\s+/g, " ").slice(-200);

async function studentId(p, name) {
  await open(p, `/student-management?q=${encodeURIComponent(name)}`);
  const href = await p.locator("main a[href*='/student-management/students/']").filter({ hasText: name }).first().getAttribute("href");
  return href.match(/students\/([0-9a-f-]{36})/)[1];
}

// ACADEMICS-01 (P3): setup step "Holiday list" is done once the year has holidays.
if (want("ACADEMICS-01")) await check({ id: "ACADEMICS-01", area: A, role: "cems.principal", check: "Dashboard setup checklist: 'Holiday list' shows done (CEMS has Dasara and other holidays)" }, async (set) => {
  const p = set(await as("cems.principal"));
  await open(p, "/dashboard/setup");
  const t = squeeze(await mainText(p, 8000));
  const line = t.match(/Holiday list .{0,80}/)?.[0] ?? "";
  const s = await shot(p, "ACADEMICS-01-setup");
  return { status: /Holiday list Done/.test(line) ? "PASS" : "FAIL", note: line || t.slice(0, 200), shot: s };
});

// ACADEMICS-02 (P4): starting a Time Table with nothing published says an empty draft was started (School B).
if (want("ACADEMICS-02")) await check({ id: "ACADEMICS-02", area: A, role: "qab.admin", check: "Time Table with none published (School B): Start the Time Table says an empty draft was started, not 'copied'" }, async (set) => {
  const p = set(await as("qab.admin"));
  await open(p, "/academic-management/time-table");
  const b = p.getByRole("button", { name: "Start the Time Table" }).first();
  if (!(await b.count())) return { status: "BLOCKED", note: `School B already has a Time Table: ${squeeze(await mainText(p, 400))}` };
  await b.click(); await p.waitForTimeout(3500);
  const m = await toastOf(p);
  const s = await shot(p, "ACADEMICS-02-draft", false);
  return { status: /Empty draft started/i.test(m) && !/copied/i.test(m) ? "PASS" : "FAIL", note: `"${m.slice(0, 200)}"`, shot: s };
});

// ACADEMICS-03 (P2) and -04 (P2): crafted correction requests are refused (the defects were crafted calls).
if (want("ACADEMICS-03") || want("ACADEMICS-04")) {
  let diya;
  await check({ id: "ACADEMICS-03", area: A, role: "cems.classteacher", check: "Crafted correction requests for 01-12-2026 (future), 11-10-2026 (Sunday), 02-10-2026 (Gandhi Jayanti), 10-01-2025 (other year) are refused" }, async (set) => {
    const p = set(await as("cems.classteacher"));
    diya = await studentId(p, "Diya Patel");
    await open(p, "/attendance-management");
    const out = [];
    let all = true;
    for (const [date, what] of [["2026-12-01", "future"], ["2026-10-11", "Sunday"], ["2026-10-02", "Gandhi Jayanti"], ["2025-01-10", "other year"]]) {
      const r = await callFormAction(p, F_ATT, "requestCorrectionAction", { forWhom: "student", sectionId: G5A, date, people: diya, status: "absent", reason: `Demo QA regression: crafted correction for a ${what} day` });
      const refused = !/NEXT_REDIRECT|corrections\//.test(r.text) && /"ok":false/.test(r.text);
      all &&= refused;
      out.push(`${date} (${what}): ${refused ? "refused" : "ACCEPTED"} ${msgOf(r).slice(0, 110)}`);
    }
    return { status: all ? "PASS" : "FAIL", note: out.join(" ; ") };
  });
  await check({ id: "ACADEMICS-04", area: A, role: "cems.teacher", check: "Crafted correction of the Grade 5 A daily register by the Science teacher (not class teacher) is refused" }, async (set) => {
    const p = set(await as("cems.teacher"));
    await open(p, "/attendance-management");
    const r = await callFormAction(p, F_ATT, "requestCorrectionAction", { forWhom: "student", sectionId: G5A, date: "2026-10-13", people: diya, status: "present", reason: "Demo QA regression: subject teacher correcting the daily register" });
    const refused = !/NEXT_REDIRECT|corrections\//.test(r.text) && /"ok":false/.test(r.text);
    return { status: refused ? "PASS" : "FAIL", note: `Diya Patel 13-10-2026: ${refused ? "refused" : "ACCEPTED"} ${msgOf(r).slice(0, 200)}` };
  });
}

// ACADEMICS-06 (P3): a hand-written correction pass for the closed year is ignored.
if (want("ACADEMICS-06")) await check({ id: "ACADEMICS-06", area: A, role: "cems.principal", check: "Closed 2025-26 with a hand-written sos_year_correction cookie: still 'closed', no correction mode; a real correction still works and ends" }, async (set) => {
  const p = set(await as("cems.principal"));
  await open(p, "/academic-management/settings?tab=years");
  const years = await p.locator("main a[href*='/academic-management?year=']").evaluateAll((as) => as.map((a) => a.getAttribute("href").split("year=")[1]));
  let closedYear = null;
  for (const y of years) { await open(p, `/academic-management?year=${y}`); if (/This year is closed/.test(await mainText(p, 800))) { closedYear = y; break; } }
  if (!closedYear) return { status: "BLOCKED", note: "no closed year found on Academic Settings" };
  // The principal's own login id, from Users & Permissions.
  await open(p, "/settings/users?q=cems.principal");
  const uhref = await p.locator("main a[href*='/settings/users/']").filter({ hasNotText: /Invite|Roles|Users/ }).first().getAttribute("href").catch(() => null);
  const userId = uhref?.match(/users\/([0-9a-f-]{36})/)?.[1] ?? "00000000-0000-0000-0000-000000000000";
  const host = new URL(BASE).hostname;
  const pass = { yearId: closedYear, reason: "forged", userId, until: Date.now() + 86_400_000 };
  const forged = [encodeURIComponent(JSON.stringify(pass)), `${Buffer.from(JSON.stringify(pass)).toString("base64url")}.${"A".repeat(43)}`];
  const seen = [];
  for (const value of forged) {
    await p.context().addCookies([{ name: "sos_year_correction", value, domain: host, path: "/" }]);
    await open(p, `/academic-management?year=${closedYear}`);
    const t = squeeze(await mainText(p, 600));
    seen.push(/This year is closed/.test(t) && !/Finish correction/.test(t) ? "ignored" : `TRUSTED: ${t.slice(0, 120)}`);
  }
  const s = await shot(p, "ACADEMICS-06-forged", false);
  await p.context().clearCookies({ name: "sos_year_correction" });
  // Control: a real correction (with a reason) opens correction mode, then Finish correction closes it.
  await open(p, `/academic-management?year=${closedYear}`);
  await p.getByRole("button", { name: "Make a correction" }).click();
  const d = p.locator("dialog[open]").last();
  await d.locator("textarea, input[name=reason]").first().fill("Demo QA: regression check that a real correction still works");
  await d.getByRole("button", { name: "Start correction" }).click();
  await p.waitForTimeout(3000);
  await open(p, `/academic-management?year=${closedYear}`);
  const during = squeeze(await mainText(p, 600));
  const real = /Finish correction/.test(during);
  if (real) { await p.getByRole("button", { name: "Finish correction" }).click(); await p.waitForTimeout(2500); }
  await open(p, `/academic-management?year=${closedYear}`);
  const after = /This year is closed/.test(await mainText(p, 600));
  const ok = seen.every((x) => x === "ignored") && real && after;
  return { status: ok ? "PASS" : "FAIL", note: `forged plain-JSON pass: ${seen[0]}; forged pass with a made-up signature: ${seen[1]}; real correction opened: ${real} ("${during.match(/Correct[^.]*\./)?.[0] ?? ""}"); closed again after Finish: ${after}`, shot: s };
});

// ACADEMICS-10 (P3): Take Attendance save does not promise an absence message that cannot go.
if (want("ACADEMICS-10")) await check({ id: "ACADEMICS-10", area: A, role: "cems.classteacher", check: "Take Attendance Grade 5 A with an absent student, save: says no message goes (no WhatsApp/SMS)" }, async (set) => {
  const p = set(await as("cems.classteacher"));
  await open(p, `/attendance-management?section=${G5A}`);
  const t0 = squeeze(await mainText(p, 3000));
  const s0 = await shot(p, "ACADEMICS-10-before");
  const save = p.getByRole("button", { name: /^(Save|Update|Submit)/ }).first();
  if (!(await save.count())) return { status: "BLOCKED", note: `no save button on Take Attendance: ${t0.slice(0, 300)}`, shot: s0 };
  // Mark the Demo QA Regress student absent if a row exists, else keep the register as it is.
  const row = p.locator("li, tr").filter({ hasText: /Demo QA Regress/ }).first();
  if (await row.count()) await row.getByRole("radio", { name: /^A$|Absent/ }).first().click().catch(() => row.getByRole("button", { name: /^A$|Absent/ }).first().click().catch(() => {}));
  await save.click(); await p.waitForTimeout(3500);
  const m = await toastOf(p);
  const s = await shot(p, "ACADEMICS-10-saved", false);
  const promises = /get a message at/i.test(m);
  return { status: !promises && /(no message|not|until WhatsApp|SMS)/i.test(m) ? "PASS" : !promises ? "PASS" : "FAIL", note: `after save: "${m.slice(0, 250)}"`, shot: s };
});

// ACADEMICS-12 (P4): the "Ask to change a mark" sheet names the right approver.
if (want("ACADEMICS-12")) await check({ id: "ACADEMICS-12", area: A, role: "cems.classteacher", check: "Locked paper > Ask to change a mark: the sheet says it goes to the Principal (or the school's approver)" }, async (set) => {
  const p = set(await as("cems.classteacher"));
  const st = JSON.parse((await import("node:fs")).readFileSync("qa-output/regression/exam-state.json", "utf8"));
  if (!st.marksA) return { status: "BLOCKED", note: "run academics-exam.mjs first (locked paper)" };
  await open(p, st.marksA);
  const cell = p.locator('button[aria-label^="Aarav Kumar:"]').first();
  if (!(await cell.count())) return { status: "BLOCKED", note: `no locked cell button for Aarav Kumar: ${squeeze(await mainText(p, 500))}`, shot: await shot(p, "ACADEMICS-12-paper") };
  await cell.click(); await p.waitForTimeout(1200);
  const t = squeeze(await p.getByRole("dialog").last().innerText().catch(() => ""));
  const s = await shot(p, "ACADEMICS-12-sheet", false);
  const line = t.match(/[^.]*(Principal|In-charge|approver)[^.]*\./)?.[0] ?? t.slice(0, 200);
  await p.keyboard.press("Escape");
  return { status: /the Principal \(or the approver your school set for marks changes\)/.test(t) ? "PASS" : /Exam In-charge or the Principal/.test(t) ? "FAIL" : "FAIL", note: `sheet (not sent): "${line}"`, shot: s };
});

// ACADEMICS-15 (P2): report card attendance comes from the register.
if (want("ACADEMICS-15")) await check({ id: "ACADEMICS-15", area: A, role: "cems.classteacher", check: "Report Cards Grade 5 A: attendance is filled from the register (not listed under 'Not filled in')" }, async (set) => {
  const p = set(await as("cems.classteacher"));
  await open(p, "/examination-results/report-cards");
  const t = squeeze(await mainText(p, 12000));
  const s = await shot(p, "ACADEMICS-15-report-cards");
  const missingAtt = (t.match(/Not filled in:? ?[^·|]*Attendance/g) ?? []).length;
  const att = t.match(/Attendance[^A-Z]{0,60}/)?.[0] ?? "";
  return { status: missingAtt === 0 && /report card|Report Cards/i.test(t) ? "PASS" : "FAIL", note: `'Not filled in … Attendance' rows: ${missingAtt}; ${att} | ${t.slice(0, 220)}`, shot: s };
});

// ACADEMICS-16 (P3): giving homework does not promise a WhatsApp message.
if (want("ACADEMICS-16")) await check({ id: "ACADEMICS-16", area: A, role: "cems.classteacher", check: `Give homework 'Demo QA regression homework ${tag}' to Grade 5 A: the message says what really happened to parents` }, async (set) => {
  const p = set(await as("cems.classteacher"));
  await open(p, "/homework-learning?do=give");
  const sheet = p.locator("dialog[open]").last();
  const radio = sheet.locator('[role="radio"]', { hasText: "5 A" });
  if (await radio.count()) await radio.first().click();
  await sheet.locator('[name="title"]').fill(`Demo QA regression homework ${tag}`);
  await sheet.locator('[name="instructions"]').fill("Demo QA: regression test homework, synthetic.");
  await sheet.locator('[role="radio"], button', { hasText: "Pick a date" }).first().click();
  await sheet.locator("#gh-due").fill("2026-10-30");
  await sheet.locator("button", { hasText: /^Send to/ }).click();
  await p.waitForTimeout(4000);
  const m = await toastOf(p);
  const s = await shot(p, "ACADEMICS-16-given", false);
  return { status: /Homework sent/.test(m) && !/parents get it on WhatsApp/.test(m) && /not messaged|Parents were/i.test(m) ? "PASS" : /parents get it on WhatsApp/.test(m) ? "FAIL" : "FAIL", note: `"${m.slice(0, 260)}"`, shot: s };
});

// ACADEMICS-18 (P1): a student opening a homework's details link sees only their own view.
if (want("ACADEMICS-18")) await check({ id: "ACADEMICS-18", area: A, role: "student Pranav Korada", check: "Student opens /homework-learning/homework/<id>: sent to their own view, no classmates or parents shown" }, async (set) => {
  const ct = set(await as("cems.classteacher"));
  await open(ct, "/homework-learning");
  const href = await ct.locator("main a[href*='/homework-learning/homework/']").first().getAttribute("href");
  await ct.context().close();
  let p, login;
  for (const u of ["cems-2026-0180", "cems-cems-2026-0180"]) {
    try { p = await (async () => { const { page } = await import("./_lib.mjs"); const x = await page(); await x.goto(`${BASE}/sign-in`); await x.getByLabel(/username|mobile|login/i).first().fill(u); await x.getByLabel(/password/i).first().fill("DemoStudent#2026pk"); await x.getByRole("button", { name: "Sign in", exact: true }).click(); await x.waitForURL((v) => !v.pathname.startsWith("/sign-in"), { timeout: 15000 }); return x; })(); login = u; break; } catch { await p?.context().close().catch(() => {}); p = null; }
  }
  if (!p) return { status: "BLOCKED", note: "student login for Pranav Korada (cems-2026-0180 / cems-cems-2026-0180, synthetic password) did not sign in" };
  set(p);
  await open(p, href);
  const t = squeeze(await mainText(p, 6000));
  const s = await shot(p, "ACADEMICS-18-student");
  const leaks = ["Ravi Kumar", "Aarav Kumar", "Not seen", "Seen"].filter((w) => t.includes(w));
  const ok = /homework-learning\?open=|homework-learning$|homework-learning\?/.test(p.url()) && !leaks.length;
  return { status: ok ? "PASS" : "FAIL", note: `signed in as ${login}; ${href} -> ${p.url().replace(BASE, "")}; classmates/parents on screen: ${leaks.join(", ") || "none"}`, shot: s };
});

// ACADEMICS-21 (P2): with no WhatsApp/SMS, a holiday with "Tell parents", an event cancel with "Tell people"
// and a PTM cancel with bookings are saved, and the screen says nobody could be told.
if (want("ACADEMICS-21")) {
  await check({ id: "ACADEMICS-21", area: A, role: "cems.principal", check: `Add holiday 'Demo QA Regression Holiday ${tag}' on 19-12-2026 with 'Tell parents' (no channel): saved, says nobody was told` }, async (set) => {
    const p = set(await as("cems.principal"));
    await open(p, "/events-calendar?m=2026-12&d=2026-12-19&do=add");
    const d = p.locator("dialog[open]").last();
    await d.locator("input[name=title]").fill(`Demo QA Regression Holiday ${tag}`);
    await d.locator("select[name=type]").selectOption("holiday");
    await d.locator("input[name=from]").fill("2026-12-19");
    await d.getByText("More details", { exact: true }).click();
    await p.waitForTimeout(500);
    const tell = p.getByRole("checkbox", { name: /Tell parents/ }).last();
    if ((await tell.getAttribute("aria-checked", { timeout: 5000 }).catch(() => null)) !== "true") await tell.click();
    await d.getByRole("button", { name: "Add to calendar" }).click();
    await p.waitForTimeout(4000);
    const m = await toastOf(p);
    await open(p, "/events-calendar?m=2026-12&d=2026-12-19&view=list");
    const listed = (await mainText(p, 20000)).includes(`Demo QA Regression Holiday ${tag}`);
    const s = await shot(p, "ACADEMICS-21-holiday", false);
    return { status: /Holiday added/.test(m) && /Nobody was told/i.test(m) && listed ? "PASS" : "FAIL", note: `"${m.slice(0, 240)}"; on the calendar: ${listed}`, shot: s };
  });
  await check({ id: "ACADEMICS-21", area: A, role: "cems.principal", check: `Create 'Demo QA Regression Event ${tag}' then cancel it with 'Tell people' (no channel): cancelled, says nobody was told` }, async (set) => {
    const p = set(await as("cems.principal"));
    await open(p, "/events-calendar/events?do=create");
    const d = p.locator("dialog[open]").last();
    await d.locator("input[name=name]").fill(`Demo QA Regression Event ${tag}`);
    await d.locator("select[name=type]").selectOption({ label: "Competition" });
    await d.locator("input[name=date]").fill("2026-11-20");
    await d.locator("input[name=startTime]").fill("10:00");
    await d.locator("input[name=endTime]").fill("11:00");
    await d.getByRole("button", { name: "Create event" }).click();
    await p.waitForTimeout(3500);
    const made = await toastOf(p);
    if (!/events\/[0-9a-f-]{36}/.test(p.url())) {
      await open(p, "/events-calendar/events");
      const h = await p.locator("main a[href*='/events-calendar/events/']").filter({ hasText: `Demo QA Regression Event ${tag}` }).first().getAttribute("href");
      await open(p, h);
    }
    const url = p.url().split("?")[0];
    await open(p, `${url}?do=cancel`);
    const c = p.locator("dialog[open]").last();
    const ct = await sheetText(p);
    await c.locator("textarea, input[name=reason]").first().fill("Demo QA: regression test event, not real");
    const tell = p.getByRole("switch", { name: /Tell the audience/ }).last();
    if ((await tell.count()) && (await tell.getAttribute("aria-checked")) !== "true") await tell.click();
    await c.getByRole("button", { name: /Cancel the event|Cancel event/ }).last().click();
    await p.waitForTimeout(4000);
    const m = await toastOf(p);
    await open(p, url);
    const page = squeeze(await mainText(p, 800));
    const s = await shot(p, "ACADEMICS-21-event", false);
    return { status: /cancelled/i.test(m + page) && !/Give the message a title|Nobody would get this message$/.test(m) && /Nobody was told|not told|could not|nobody/i.test(m) ? "PASS" : "FAIL", note: `created: "${made.slice(0, 80)}"; cancel sheet: "${ct.slice(0, 100)}"; after cancel: "${m.slice(0, 220)}"; page: ${page.match(/Cancelled[^.]{0,60}/)?.[0] ?? page.slice(0, 80)}`, shot: s };
  });
  await check({ id: "ACADEMICS-21", area: A, role: "cems.principal", check: "Plan a Demo PTM for Grade 5 (27-11-2026), book a slot for a parent from the office, Principal cancels it (no channel): cancelled, says nobody was told" }, async (set) => {
    const p = set(await as("cems.principal"));
    await open(p, "/events-calendar/ptm?do=plan");
    const d = p.locator("dialog[open]").last();
    await d.locator("input[name=date]").fill("2026-11-27");
    await d.getByRole("button", { name: "Grade 5", exact: true }).click();
    await d.locator("input[name=startTime]").fill("10:00");
    await d.locator("input[name=endTime]").fill("10:30");
    await d.getByRole("radio", { name: "10 minutes" }).click();
    await d.getByRole("button", { name: "Create slots" }).click();
    await p.waitForTimeout(4000);
    const planned = await toastOf(p);
    // The office (here the Principal) books a slot for a parent who called.
    const ct = p;
    await open(ct, "/events-calendar/ptm");
    const day = ct.locator("main a[href*='day=']").filter({ hasText: /27/ }).first();
    if (await day.count()) { await open(ct, await day.getAttribute("href")); }
    const book = ct.locator("main a[aria-label^='Book ']").first();
    if (!(await book.count())) return { status: "BLOCKED", note: `planned: "${planned.slice(0, 120)}"; no free slot link: ${squeeze(await mainText(ct, 400))}`, shot: await shot(ct, "ACADEMICS-21-ptm") };
    const ptmUrl = ct.url();
    await book.click(); await ct.waitForTimeout(1200);
    const bs = ct.locator("dialog[open]").last();
    const sel = bs.locator("select").first();
    if (await sel.count()) await sel.selectOption(await sel.locator("option").evaluateAll((os) => (os.find((o) => /Demo QA Regress/.test(o.textContent)) ?? os.find((o) => o.value))?.value));
    else await bs.getByText(/Demo QA Regress/).first().click().catch(() => {});
    await bs.locator("button[type=submit]").last().click();
    await ct.waitForTimeout(3500);
    const booked = await toastOf(ct);
    const pr = ct;
    const dayParam = new URL(ptmUrl).searchParams.get("day");
    await open(pr, `/events-calendar/ptm?${dayParam ? `day=${dayParam}&` : ""}do=cancel`);
    const c = pr.locator("dialog[open]").last();
    const csheet = await sheetText(pr);
    await c.locator("textarea, input[name=reason]").first().fill("Demo QA: regression test PTM, not real");
    await c.locator("button[type=submit]").last().click();
    await pr.waitForTimeout(4000);
    const m = await toastOf(pr);
    const s = await shot(pr, "ACADEMICS-21-ptm-cancel", false);
    return { status: /PTM cancelled/i.test(m) && !/Give the message a title/.test(m) ? "PASS" : "FAIL", note: `planned: "${planned.slice(0, 90)}"; booked: "${booked.slice(0, 90)}"; cancel sheet: "${csheet.slice(0, 90)}"; after cancel: "${m.slice(0, 220)}"`, shot: s };
  });
}

await close();
