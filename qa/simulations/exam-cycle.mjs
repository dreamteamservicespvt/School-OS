// Exam cycle: the Exam In-charge creates "Demo QA Simulation Class Test" for Grade 5 (Mathematics
// only, out of 20, on 15-10-2026) and publishes the datesheet; the Maths teacher (class teacher of
// Grade 5 A) enters and submits marks; the Exam In-charge checks/locks (approval); results for
// Grade 5 A are published; the report card is opened.
//   node qa/simulations/exam-cycle.mjs [create,marks,approve,publish,card]
import { as, visit, text, shot, record, done, close, sql, SCHOOL_A, feedback } from "./sim-lib.mjs";

const A = "sim-exam";
const ONLY = process.argv[2] ?? "create,marks,approve,publish,card";
const on = (k) => ONLY.split(",").includes(k);
const TITLE = "Demo QA Simulation Class Test";
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const exam = () => sql(`select id, status from exam where school_id='${SCHOOL_A}' and title='${TITLE}'`)[0];
const entry = () => sql(`select d.id from datesheet_entry d join exam e on e.id=d.exam_id join subject s on s.id=d.subject_id where e.title='${TITLE}' and s.name='Mathematics'`)[0]?.[0];

if (on("create") && !exam()) {
  const ex = await as("cems.exam");
  await visit(ex, "/examination-results/datesheet/new");
  await ex.getByRole("button", { name: "Grade 5", exact: true }).click();
  await ex.waitForTimeout(1000);
  await ex.getByLabel("Title").fill(TITLE);
  await ex.getByLabel("Exam type").selectOption({ label: "Internal Assessment" });
  await ex.getByLabel("Term").selectOption({ label: "Term 2" });
  await ex.getByLabel("Start date").fill("2026-10-15");
  await ex.getByLabel("End date").fill("2026-10-16");
  await ex.waitForTimeout(800);
  const dates = ex.locator("input[type=date][aria-label$='exam date']");
  const labels = [];
  for (let i = 0; i < await dates.count(); i++) labels.push(await dates.nth(i).getAttribute("aria-label"));
  const lbl = labels.find((l) => l.startsWith("Mathematics"));
  const base = lbl.replace(/ exam date$/, "");
  await ex.getByLabel(lbl, { exact: true }).fill("2026-10-15");
  await ex.getByLabel(`${base} maximum marks`, { exact: true }).fill("20");
  // 16-10-2026 is taken by Demo Unit Test 2 (the clash check refuses 9:30 AM, 11:00 AM and 1:30 PM), so 15-10-2026 is used.
  const tsel = ex.getByLabel(`${base} start time`, { exact: true });
  const topts = await tsel.locator("option").allInnerTexts();
  console.log("times", topts.join("|"));
  await tsel.selectOption({ label: topts.find((o) => /11:30 AM|11:00 AM|3:00 PM|2:30 PM/.test(o)) ?? topts[topts.length - 1] });
  await ex.getByRole("button", { name: "Save as draft" }).click();
  await ex.waitForURL(/datesheet\/[0-9a-f-]{36}/, { timeout: 30000 }).catch(() => {});
  await ex.waitForTimeout(1500);
  const fb = await feedback(ex, 100);
  record({ area: A, role: "Exam In-charge", check: `Create datesheet "${TITLE}" for Grade 5 (Mathematics out of 20, 15-10-2026) as draft`, status: exam() ? "PASS" : "FAIL", note: `${fb.slice(0, 160)}; subject rows offered: ${labels.map((l) => l.replace(/ exam date$/, "")).join(", ")}` });
  if (exam()) {
    await ex.getByRole("button", { name: "Publish datesheet" }).click();
    await ex.waitForTimeout(800);
    const dlg = ex.getByRole("dialog");
    const body = (await dlg.innerText()).replace(/\s+/g, " ");
    await dlg.getByRole("button", { name: /^Publish/ }).last().click();
    await ex.waitForTimeout(4000);
    const fb2 = await feedback(ex, 100);
    await shot(ex, "exam-01-datesheet-published");
    record({ area: A, role: "Exam In-charge", check: "Publish the datesheet", status: /PUBLISHED|SCHEDULED|ONGOING/i.test(exam()[1]) || /publish/i.test(fb2) ? "PASS" : "FAIL", note: `${body.slice(0, 150)} => ${fb2.slice(0, 150)}; exam status ${exam()[1]}` });
  }
  await done(ex);
}

if (on("marks") && entry()) {
  const ct = await as("cems.classteacher");
  await visit(ct, `/examination-results/marks/${entry()}/${G5A}`);
  await ct.waitForTimeout(1500);
  const cells = ct.locator("input[aria-label^='Marks for ']");
  const n = await cells.count();
  const names = [];
  for (let i = 0; i < n; i++) names.push((await cells.nth(i).getAttribute("aria-label")).replace(/^Marks for /, "").replace(/, out of 20$/, ""));
  const plan = {};
  names.forEach((nm, i) => { plan[nm] = nm === "Rohan Singh" || nm === "Sahithi Gorle" ? "AB" : nm === "Karthik Pydi" ? "5" : nm === "Aarav Kumar" ? "20" : String(10 + ((i * 7) % 11)); });
  if (sql(`select count(*) from marks where entry_id='${entry()}'`)[0][0] === "0" || process.env.REFILL) {
    for (const [nm, v] of Object.entries(plan)) {
      const c = ct.getByLabel(`Marks for ${nm}, out of 20`);
      if (await c.isEditable().catch(() => false)) { await c.fill(v); await c.press("Tab"); await ct.waitForTimeout(150); }
    }
    await ct.waitForTimeout(3000);
  }
  await ct.getByRole("button", { name: "Submit marks" }).click();
  await ct.waitForTimeout(1500);
  const sheet = ct.getByRole("dialog");
  const st = (await sheet.innerText().catch(() => "")).replace(/\s+/g, " ");
  const sb = sheet.getByRole("button", { name: /^Submit \d+ marks/ });
  if (await sb.count()) { await sb.click(); await ct.waitForTimeout(3500); }
  const fb = await feedback(ct, 100);
  await shot(ct, "exam-02-marks-submitted");
  const saved = sql(`select count(*), count(*) filter (where absent) from marks where entry_id='${entry()}'`)[0];
  record({ area: A, role: "Class Teacher (Maths)", check: `Enter and submit Mathematics marks for Grade 5 A (${n} students, 2 absent)`, status: /submitted/i.test(fb) ? "PASS" : "FAIL", note: `${fb.slice(0, 160)} | sheet: ${st.slice(0, 160)} | saved ${saved[0]} rows, ${saved[1]} absent | students listed: ${names.length}${names.includes("Harini Inti") ? " (includes Harini Inti, TRANSFERRED)" : ""}` });
  await done(ct);
}

if (on("approve") && entry()) {
  const ex = await as("cems.exam");
  await visit(ex, `/examination-results/marks?exam=${exam()[0]}`);
  const t = await text(ex, 3000);
  const line = t.split("\n").findIndex((l) => /Mathematics · Grade 5 A/.test(l));
  const block = t.split("\n").slice(line, line + 12).join(" | ");
  await visit(ex, `/examination-results/marks/${entry()}/${G5A}`);
  const page = await text(ex, 3000);
  const btns = (await ex.locator("main button").allInnerTexts()).map((x) => x.trim()).filter((x) => /Lock|Approve|Send back|Unlock|Accept/i.test(x));
  let fb = "";
  const lockBtn = ex.locator("main").getByRole("button", { name: /^(Lock|Approve|Accept)/ }).first();
  if (await lockBtn.count()) {
    await lockBtn.click();
    await ex.waitForTimeout(1000);
    const dlg = ex.getByRole("dialog");
    if (await dlg.isVisible().catch(() => false)) await dlg.getByRole("button", { name: /^(Lock|Approve|Accept)/ }).last().click().catch(() => {});
    await ex.waitForTimeout(3000);
    fb = await feedback(ex, 100);
  }
  const st = sql(`select status from marks_paper where entry_id='${entry()}' and section_id='${G5A}'`)[0]?.[0] ?? "";
  await shot(ex, "exam-03-marks-locked");
  record({ area: A, role: "Exam In-charge", check: "Exam In-charge checks the submitted Grade 5 A Maths marks and locks (approves) them", status: /lock/i.test(fb + st) || /Locked/.test(page) ? "PASS" : "FAIL", note: `status list: ${block.slice(0, 200)} | buttons: ${btns.join(", ") || "none"} | ${fb.slice(0, 150)} | page: ${page.match(/Locked[^\n]*|Submitted[^\n]*/)?.[0] ?? ""}` });
  await done(ex);
}

if (on("publish") && exam()) {
  const ex = await as("cems.exam");
  await visit(ex, `/examination-results/results?exam=${exam()[0]}&section=${G5A}`);
  let t = await text(ex, 5000);
  await shot(ex, "exam-04-results-before-publish");
  const aarav = t.match(/Aarav Kumar.{0,80}/s)?.[0]?.replace(/\s+/g, " ");
  const karthik = t.match(/Karthik Pydi.{0,80}/s)?.[0]?.replace(/\s+/g, " ");
  record({ area: A, role: "Exam In-charge", check: "Results for Grade 5 A show the entered marks (Aarav 20/20, Karthik 5/20 fail, 2 absent)", status: /20/.test(aarav ?? "") && /Fail/.test(t.match(/Karthik Pydi.{0,200}/s)?.[0] ?? "") ? "PASS" : "FAIL", note: `Aarav: ${aarav} | Karthik: ${karthik}` });
  const pubBtn = ex.locator("button", { hasText: /Review and publish|Publish results/ }).first();
  if (await pubBtn.count()) {
    await pubBtn.click();
    await ex.waitForTimeout(800);
    const dlg = ex.getByRole("dialog").first();
    const boxes = dlg.locator('input[type="checkbox"]:not([disabled])');
    for (let i = 0; i < await boxes.count(); i++) {
      const lab = (await boxes.nth(i).evaluate((e) => e.closest("label")?.innerText ?? e.parentElement.innerText)).replace(/\s+/g, " ");
      if (/5 A/.test(lab)) await boxes.nth(i).check(); else if (await boxes.nth(i).isChecked()) await boxes.nth(i).uncheck();
    }
    const dt = (await dlg.innerText()).replace(/\s+/g, " ");
    await dlg.locator("button", { hasText: "Publish now" }).click();
    await ex.waitForTimeout(800);
    const sheet = ex.locator("dialog[open]").last();
    const ct = (await sheet.innerText()).replace(/\s+/g, " ");
    await sheet.locator("button", { hasText: /Publish and tell|Publish now|^Publish/ }).last().click();
    await ex.waitForTimeout(6000);
    const fb = await feedback(ex, 100);
    const pubs = sql(`select status, array_length(section_ids,1) from result_publication where key='exam:${exam()[0]}'`);
    await shot(ex, "exam-05-results-published");
    record({ area: A, role: "Exam In-charge", check: "Publish Grade 5 A results", status: /published/i.test(fb) || pubs.some((p) => /PUBLISHED/i.test(p[0])) ? "PASS" : "FAIL", note: `dialog: ${dt.slice(0, 160)} | confirm: ${ct.slice(0, 160)} | ${fb.slice(0, 160)} | publications ${JSON.stringify(pubs)}` });
  } else record({ area: A, role: "Exam In-charge", check: "Publish Grade 5 A results", status: "FAIL", note: `no publish button; ${t.slice(0, 300)}` });
  await done(ex);
}

if (on("card") && exam()) {
  const pr = await as("cems.classteacher");
  await visit(pr, `/examination-results/report-cards?section=${G5A}`);
  const sel = pr.locator("select").filter({ has: pr.locator("option", { hasText: "Whole year (final result)" }) }).first();
  await sel.selectOption({ label: `${TITLE} report card` });
  await pr.waitForTimeout(3000);
  const t = await text(pr, 5000);
  await shot(pr, "exam-06-report-cards");
  const header = t.split("\n").find((l) => / · Grade 5 A$/.test(l)) ?? "";
  const ready = t.match(/(\d+) report cards of (\d+) ready/);
  const row = pr.locator("tr", { hasText: "Aarav Kumar" }).first();
  const link = row.getByRole("link", { name: /View PDF/ });
  let pdf = "no View PDF for Aarav";
  if (await link.count()) {
    const href = await link.getAttribute("href");
    const res = await pr.request.get(new URL(href, pr.url()).toString());
    pdf = `${href.slice(0, 120)} -> ${res.status()} ${res.headers()["content-type"]} ${(await res.body()).length} bytes`;
  }
  record({ area: A, role: "Class Teacher", check: "Report Cards: choose the simulation exam, Grade 5 A cards are ready and Aarav Kumar's card opens as PDF", status: header.startsWith(TITLE) && /200 application\/pdf/.test(pdf) ? "PASS" : "FAIL", note: `header "${header}"; ${ready?.[0]}; ${pdf}` });
  // Who is not ready, and why.
  const notReady = t.split("\n").filter((l) => /\t(Not ready|Waiting|Blocked)/.test(l)).slice(0, 4).join(" | ");
  if (ready && ready[1] !== ready[2]) record({ area: A, role: "Class Teacher", check: "Every published student has a report card ready", status: "FAIL", note: `${ready[0]}; not ready rows: ${notReady.replace(/\t/g, " ") || "(see screenshot exam-06-report-cards.png)"}` });
  await done(pr);
}
await close();
