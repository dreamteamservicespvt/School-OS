// Regression re-test of ACADEMICS-08 (exam days only for the exam's classes), ACADEMICS-09 (ML saved as
// medical leave) and ACADEMICS-13 (results can be published from the screen), with a new Demo exam:
// "Demo QA Regression Exam <tag>", Grade 5, Mathematics only.
//   QA_OUT=qa-output/regression node qa/regression/academics-exam.mjs [step]
import { as, open, settle, mainText, shot, close, squeeze, rec, check, BASE } from "./_lib.mjs";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const A = "academics";
const STATE = "qa-output/regression/exam-state.json";
const st = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const save = () => writeFileSync(STATE, JSON.stringify(st, null, 2));
st.tag ??= String(Date.now()).slice(-5);
const TITLE = `Demo QA Regression Exam ${st.tag}`;
const step = process.argv[2] ?? "all";
const toastOf = async (p) => squeeze((await p.locator("[role=status], [role=alert]").allInnerTexts().catch(() => [])).join(" | "));
const MAX = "20";

// 1. Exam In-charge makes and publishes the datesheet.
if (["all", "create"].includes(step) && !st.exam) await check({ id: "ACADEMICS-08", area: A, role: "cems.exam", check: `Make and publish datesheet "${TITLE}" for Grade 5 (setup)` }, async (set) => {
  const p = set(await as("cems.exam"));
  await open(p, "/examination-results/datesheet/new");
  await p.getByRole("group", { name: "Class" }).getByRole("button", { name: "Grade 5", exact: true }).click();
  await p.waitForTimeout(1000);
  await p.getByLabel("Title").fill(TITLE);
  const et = p.getByLabel("Exam type");
  await et.selectOption(await et.locator("option").evaluateAll((os) => (os.find((o) => /Class Test|Unit Test/.test(o.textContent)) ?? os.find((o) => o.value))?.value));
  await p.getByLabel("Term").selectOption({ label: "Term 2" });
  await p.getByLabel("Start date").fill("2026-10-14");
  await p.getByLabel("End date").fill("2026-10-14");
  await p.waitForTimeout(800);
  const lbl = (await p.locator("input[type=date][aria-label$='exam date']").evaluateAll((es) => es.map((e) => e.getAttribute("aria-label")))).find((l) => l.startsWith("Mathematics"));
  const base = lbl.replace(/ exam date$/, "");
  await p.getByLabel(lbl, { exact: true }).fill("2026-10-14");
  await p.getByLabel(`${base} maximum marks`, { exact: true }).fill(MAX);
  await p.getByRole("button", { name: "Save as draft" }).click();
  await p.waitForURL(/datesheet\/[0-9a-f-]{36}/, { timeout: 30000 }).catch(() => {});
  if (!/datesheet\/[0-9a-f-]{36}/.test(p.url())) return { status: "BLOCKED", note: `datesheet not saved: ${(await toastOf(p)).slice(0, 300)}`, shot: await shot(p, "ACADEMICS-exam-create") };
  st.exam = p.url().match(/datesheet\/([0-9a-f-]{36})/)[1]; save();
  await settle(p);
  await p.getByRole("button", { name: "Publish datesheet" }).click();
  await p.waitForTimeout(800);
  await p.getByRole("dialog").getByRole("button", { name: /^Publish/ }).last().click();
  await p.waitForTimeout(4000);
  const m = await toastOf(p);
  return { status: /publish/i.test(m) ? "PASS" : "FAIL", note: `setup only: ${m.slice(0, 200)}` };
});

// 1b. ACADEMICS-08: the exam day is on the calendar for Grade 5 only.
if (["all", "calendar"].includes(step) && st.exam) await check({ id: "ACADEMICS-08", area: A, role: "cems.principal", check: "School Calendar: the new exam's day is for Grade 5 only (shown for Grade 5, not for Grade 7)" }, async (set) => {
  const p = set(await as("cems.principal"));
  const look = async (cls) => {
    await open(p, "/events-calendar?m=2026-10&d=2026-10-14&type=exam_day&view=list");
    const sel = p.locator("main select").filter({ has: p.locator("option", { hasText: /^Grade 7/ }) }).first();
    if (!(await sel.count())) return null;
    const v = await sel.locator("option").evaluateAll((os, c) => os.find((o) => o.textContent.trim().startsWith(c))?.value, cls);
    await sel.selectOption(v); await p.waitForTimeout(2000); await settle(p);
    return squeeze(await mainText(p, 30000));
  };
  const g5 = await look("Grade 5");
  const g7 = await look("Grade 7");
  const s = await shot(p, "ACADEMICS-08-calendar-grade7", false);
  if (g5 === null) return { status: "BLOCKED", note: "no class filter found on the School Calendar list", shot: s };
  const in5 = g5.includes(TITLE), in7 = g7.includes(TITLE);
  return { status: in5 && !in7 ? "PASS" : "FAIL", note: `Grade 5 filter shows "${TITLE}": ${in5}; Grade 7 filter shows it: ${in7}`, shot: s };
});

// 2. ACADEMICS-09: class teacher marks Aditya Kumar ML; after reload the cell still says ML.
if (["all", "marks"].includes(step) && st.exam) await check({ id: "ACADEMICS-09", area: A, role: "cems.classteacher", check: "Marks Entry Grade 5 A Maths: Aditya Kumar typed ML is still ML after reload (not AB)" }, async (set) => {
  const p = set(await as("cems.classteacher"));
  await open(p, "/examination-results/marks");
  const link = p.locator("main a[href*='/examination-results/marks/']").filter({ hasText: new RegExp(`${st.tag}|Mathematics`) });
  const hrefs = await link.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  // The paper's link carries the entry and section; choose this exam's 5 A paper.
  let url = null;
  for (const h of hrefs) { await open(p, h); if ((await mainText(p, 600)).includes(TITLE) && /5 A/.test(await mainText(p, 600))) { url = h; break; } }
  if (!url) return { status: "BLOCKED", note: `could not find ${TITLE} Grade 5 A Maths in Marks Entry (links: ${hrefs.slice(0, 5).join(", ")})`, shot: await shot(p, "ACADEMICS-09-marks-list") };
  st.marksA = url; save();
  const cells = p.locator(`input[aria-label^="Marks for "]`);
  const n = await cells.count();
  const names = [];
  for (let i = 0; i < n; i++) names.push((await cells.nth(i).getAttribute("aria-label")).replace(/^Marks for /, "").replace(/, out of.*$/, ""));
  for (let i = 0; i < n; i++) { await cells.nth(i).fill(names[i] === "Aditya Kumar" ? "ML" : String(8 + (i % 12))); await cells.nth(i).press("Tab"); await p.waitForTimeout(150); }
  await p.waitForTimeout(4000);
  await open(p, url);
  const adi = await p.getByLabel(/^Marks for Aditya Kumar, out of/).inputValue().catch(() => "?");
  const rowT = squeeze(await p.locator("tr", { has: p.getByLabel(/^Marks for Aditya Kumar/) }).innerText().catch(() => ""));
  const s = await shot(p, "ACADEMICS-09-after-reload");
  // Submit the marks for the publish step.
  await p.getByRole("button", { name: "Submit marks" }).click(); await p.waitForTimeout(1500);
  const sb = p.getByRole("dialog").getByRole("button", { name: /^Submit \d+ marks/ });
  if (await sb.count()) { await sb.click(); await p.waitForTimeout(3000); }
  const sub = await toastOf(p);
  return { status: /^ML$/i.test(adi.trim()) || (/ML|medical/i.test(rowT) && !/\bAB\b/.test(adi)) ? "PASS" : "FAIL", note: `${n} students; after reload Aditya's cell shows "${adi}" (row: ${rowT.slice(0, 120)}); submit: ${sub.slice(0, 120)}`, shot: s };
});

// 3. Exam In-charge fills Grade 5 B and publishes results (ACADEMICS-13).
if (["all", "publish"].includes(step) && st.exam) await check({ id: "ACADEMICS-13", area: A, role: "cems.exam", check: "Results > Review and publish > Publish now opens the confirm sheet and publishes" }, async (set) => {
  const p = set(await as("cems.exam"));
  await open(p, "/examination-results/marks");
  const hrefs = await p.locator("main a[href*='/examination-results/marks/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const notes = [];
  for (const h of [...new Set(hrefs)]) {
    if (h === st.marksA) continue;
    await open(p, h);
    const head = await mainText(p, 600);
    if (!head.includes(TITLE)) continue;
    const cells = p.locator(`input[aria-label^="Marks for "]:not([disabled])`);
    const n = await cells.count();
    for (let i = 0; i < n; i++) { await cells.nth(i).fill(String(9 + (i % 10))); await cells.nth(i).press("Tab"); await p.waitForTimeout(120); }
    await p.waitForTimeout(3000);
    const sbtn = p.getByRole("button", { name: "Submit marks" });
    if (await sbtn.count()) { await sbtn.click(); await p.waitForTimeout(1500); const sb = p.getByRole("dialog").getByRole("button", { name: /^Submit \d+ marks/ }); if (await sb.count()) { await sb.click(); await p.waitForTimeout(3000); } }
    notes.push(`${h.split("/").pop().slice(0, 8)}: ${n} marks, ${(await toastOf(p)).slice(0, 60)}`);
  }
  await open(p, `/examination-results/results?exam=${st.exam}`);
  await p.waitForTimeout(1000);
  const before = squeeze(await mainText(p, 2000));
  const rp = p.locator("button", { hasText: /Review and publish|Publish results/ }).first();
  if (!(await rp.count())) return { status: "BLOCKED", note: `no 'Review and publish' button: ${before.slice(0, 300)} | marks: ${notes.join("; ")}`, shot: await shot(p, "ACADEMICS-13-results") };
  await rp.click(); await p.waitForTimeout(800);
  const dlg = p.getByRole("dialog").first();
  const boxes = dlg.locator('input[type="checkbox"]:not([disabled])');
  for (let i = 0; i < (await boxes.count()); i++) if (!(await boxes.nth(i).isChecked())) await boxes.nth(i).check();
  await dlg.locator("button", { hasText: "Publish now" }).click();
  await p.waitForTimeout(1200);
  const open1 = await p.locator("dialog[open]").count();
  const sheetT = squeeze(await p.locator("dialog[open]").last().innerText().catch(() => ""));
  const s1 = await shot(p, "ACADEMICS-13-confirm", false);
  if (!open1) return { status: "FAIL", note: `after Publish now no confirm sheet is open (both closed). marks: ${notes.join("; ")}`, shot: s1 };
  await p.locator("dialog[open]").last().locator("button", { hasText: /Publish and tell|Publish now|^Publish/ }).last().click();
  await p.waitForTimeout(6000);
  const m = await toastOf(p);
  await open(p, `/examination-results/results?exam=${st.exam}`);
  const after = squeeze(await mainText(p, 2500));
  const s = await shot(p, "ACADEMICS-13-published", false);
  return { status: /published/i.test(m) ? "PASS" : "FAIL", note: `confirm sheet: "${sheetT.slice(0, 120)}"; after: "${m.slice(0, 160)}"; page: ${after.match(/Published[^.]{0,80}/)?.[0] ?? after.slice(0, 120)}`, shot: s };
});

await close();
