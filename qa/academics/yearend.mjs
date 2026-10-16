// Year end, LAST, in Sunrise Public School (SPS), not Chaitanya EM School.
// Why: in CEMS 2026-27 is the only active year with 352 students that every other QA agent
// is using; opening 2027-28 there would close or freeze it, and promotion turns students to
// PROMOTED. Sunrise has its own 2025-26 (closed), 2026-27 (active) and 2027-28 (upcoming).
// Covers: Academic Settings years (open-year sheet, cancelled, never confirmed), closed year
// read-only, forged correction pass ignored (ACADEMICS-06), real correction, teacher refused,
// Promotion review (Nursery A to LKG 2027-28), missing reason refused, confirm, undo, 375px.
import { BASE, mainText, close, layoutIssues, VIEWPORTS } from "../lib.mjs";
import { res, login, open, sql, uuidOf, sleep } from "./r.mjs";
import { callAction, callFormAction } from "./action.mjs";

const SPS = (s) => sql(s, "SPS");
const M = "Academic Management";
const SM = "Student Management";
const A = "src/app/(school)/academic-management/actions.ts";
const Y = "src/app/(school)/academic-management/syllabus/actions.ts";
const P = "src/app/(school)/student-management/_actions/promotion.ts";
const msg = (r) => `${r.text.match(/"message":"[^"]*"/)?.[0] ?? ""} ${r.text.match(/"errors":\{[^}]*\}/)?.[0] ?? ""}`.trim() || r.text.replace(/\s+/g, " ").slice(-200);
const refused = (r) => /"ok":false|"errors"/.test(r.text);

const yearId = (n) => uuidOf(SPS(`select id from academic_year where name='${n}' and archived_at is null;`));
const y25 = yearId("2025-26"), y26 = yearId("2026-27"), y27 = yearId("2027-28");
const nurseryA = uuidOf(SPS(`select x.id from section x join school_class c on c.id=x.class_id where c.name='Nursery' and x.name='A' and x.academic_year_id='${y26}';`));
const cls25 = uuidOf(SPS(`select x.class_id from section x where x.academic_year_id='${y25}' and x.archived_at is null limit 1;`));
const subj = uuidOf(SPS("select id from subject where archived_at is null limit 1;"));
const statusOf = () => SPS(`select st.status, e.status es, count(*) from enrolment e join student st on st.id=e.student_id where e.section_id='${nurseryA}' and e.archived_at is null group by 1,2;`).replace(/\s+/g, " ");
console.log({ y25, y26, y27, nurseryA, cls25, subj, before: statusOf() });

// Sunrise logins are not cached in the CEMS session folder; use their own names.
const pr = await login("principal");
const principalId = uuidOf(SPS("select id from user_login where username='principal';"));
// Dev server: compile every page whose actions are called, before the manifest is first read.
for (const u of ["/academic-management/syllabus", "/academic-management", "/student-management/promotion"]) await open(pr, u);

// RESUME=1 starts at the correction screen (the browser can crash when memory is short).
const RESUME = Boolean(process.env.RESUME);
let t, r;
const tt = await login("teacher");
const item = { yearId: y25, classId: cls25, subjectId: subj, kind: "CHAPTER", title: "Demo QA closed-year chapter", plannedFrom: "2025-11-03", plannedTo: "2025-11-14" };
if (!RESUME) {
// 1. Academic Settings: the years and the "Open 2027-28" sheet (looked at, then cancelled).
await open(pr, "/academic-management/settings");
t = (await mainText(pr, 3000)).replace(/\s+/g, " ");
res(M, "Academic Settings", "Principal sees the years 2025-26, 2026-27, 2027-28 with their status", "Principal (Sunrise)", "Three years with Closed / Active / Upcoming", t.match(/2025-26.{0,40}|2026-27.{0,40}|2027-28.{0,40}/g)?.join(" | ") ?? t.slice(0, 200), /2025-26/.test(t) && /2027-28/.test(t) ? "PASS" : "FAIL");
const openBtn = pr.locator("button", { hasText: "Open 2027-28" }).first();
if (await openBtn.count()) {
  await openBtn.click();
  const d = pr.locator("dialog[open]");
  await d.waitFor({ timeout: 10000 }).catch(() => {});
  const dt = (await d.innerText().catch(() => "")).replace(/\s+/g, " ");
  res(M, "Academic Settings", "Open 2027-28: the sheet asks what to do with 2026-27 (keep open / close now)", "Principal (Sunrise)", "Choice between Keep it open and Close it now, in plain words", dt.slice(0, 300), /Keep it open/.test(dt) && /Close it now/.test(dt) ? "PASS" : "FAIL");
  await d.locator("button", { hasText: "Cancel" }).first().click().catch(() => pr.keyboard.press("Escape"));
  await sleep(500);
  const still = SPS(`select status from academic_year where id='${y27}';`);
  res(M, "Academic Settings", "Cancel the Open 2027-28 sheet (not confirmed on purpose: shared demo data)", "Principal (Sunrise)", "Nothing changes; 2027-28 stays Upcoming", still.replace(/\s+/g, " "), /UPCOMING/.test(still) ? "PASS" : "FAIL");
} else {
  res(M, "Academic Settings", "Open 2027-28 button", "Principal (Sunrise)", "Shown for an upcoming year", "button not found", "FAIL");
}
r = await callAction(tt, "src/app/(school)/academic-management/settings/actions.ts", "openYearAction", [y27, "keep"]);
res(M, "Academic Settings", "Class teacher opens 2027-28 (crafted call)", "Class Teacher (Sunrise)", "Refused; year unchanged", `${r.text.replace(/\s+/g, " ").slice(-160)} | ${SPS(`select status from academic_year where id='${y27}';`).replace(/\s+/g, " ")}`, !/ACTIVE/.test(SPS(`select status from academic_year where id='${y27}';`)) && /not|cannot|only|allowed|permission/i.test(r.text) ? "PASS" : "FAIL");

// 2. A closed year is read-only.
r = await callFormAction(pr, Y, "addItemAction", item);
res(M, "Syllabus", "Add a syllabus item to closed 2025-26 without a correction", "Principal (Sunrise)", "Refused: the year is closed", msg(r), refused(r) && /closed/i.test(r.text) ? "PASS" : "FAIL");

// 3. A hand-written correction pass (plain JSON, as the old cookie was) must be ignored.
const host = new URL(BASE).hostname;
await pr.context().addCookies([{ name: "sos_year_correction", value: encodeURIComponent(JSON.stringify({ yearId: y25, reason: "forged", userId: principalId, until: Date.now() + 86_400_000 })), domain: host, path: "/" }]);
r = await callFormAction(pr, Y, "addItemAction", item);
res(M, "Syllabus", "Add to closed 2025-26 with a hand-written correction cookie (24 h, no audit)", "Principal (Sunrise)", "Refused: the year is closed (forged pass ignored)", msg(r), refused(r) && /closed/i.test(r.text) ? "PASS" : "FAIL", refused(r) ? undefined : "ACADEMICS-06");
await pr.context().clearCookies({ name: "sos_year_correction" });

// 4. Teacher cannot start a correction; Principal can, with a reason.
r = await callFormAction(tt, A, "startCorrection", { yearId: y25, reason: "Demo: QA teacher try" });
res(M, "Classes", "Class teacher starts a correction of 2025-26 (crafted call)", "Class Teacher (Sunrise)", "Refused", msg(r), refused(r) ? "PASS" : "FAIL");
r = await callFormAction(pr, A, "startCorrection", { yearId: y25, reason: "" });
res(M, "Classes", "Start a correction with no reason", "Principal (Sunrise)", "Refused: a reason is needed", msg(r), refused(r) ? "PASS" : "FAIL");
}
await open(pr, `/academic-management/syllabus?year=${y25}`);
const mk = pr.locator("button", { hasText: "Make a correction" }).first();
if (await mk.count()) {
  await mk.click();
  const d = pr.locator("dialog[open]");
  await d.locator("textarea[name=reason]").fill("Demo: QA check of the correction flow");
  await d.locator("button", { hasText: "Start correction" }).click();
  await pr.waitForTimeout(3000);
  t = (await mainText(pr, 1500)).replace(/\s+/g, " ");
  res(M, "Syllabus", "Make a correction of 2025-26 from the closed-year strip", "Principal (Sunrise)", "Strip says Correcting 2025-26 with the reason", t.match(/Correcting 2025-26[^.]*\.[^.]*\./)?.[0] ?? t.slice(0, 200), /Correcting 2025-26/.test(t) ? "PASS" : "FAIL");
  const ck = (await pr.context().cookies()).find((c) => c.name === "sos_year_correction");
  res(M, "Syllabus", "The correction pass cookie is signed", "Principal (Sunrise)", "Cookie is not readable JSON and carries a signature", ck ? `${ck.value.slice(0, 24)}… httpOnly=${ck.httpOnly}` : "no cookie", ck && !ck.value.startsWith("%7B") && ck.value.includes(".") && ck.httpOnly ? "PASS" : "FAIL");
  r = await callFormAction(pr, Y, "addItemAction", item);
  const added = uuidOf(SPS(`select id from syllabus_item where title='${item.title}' and archived_at is null;`));
  const audit = SPS(`select count(*) from audit_log_entry where record_type='Academic Year' and record_id='${y25}' and action in ('correction','correction-started') and created_at > now() - interval '5 minutes';`).match(/\d+/g)?.[0];
  res(M, "Syllabus", "Add a syllabus item to 2025-26 during the correction", "Principal (Sunrise)", "Added; the Audit Log has the correction with the reason", `${msg(r)} | audit rows: ${audit}`, added && Number(audit) >= 2 ? "PASS" : "FAIL");
  if (added) { r = await callAction(pr, Y, "archiveItemAction", [added]); console.log("archived:", r.text.slice(-100)); }
  await pr.locator("button", { hasText: "Finish correction" }).first().click().catch(() => {});
  await pr.waitForTimeout(2000);
  r = await callFormAction(pr, Y, "addItemAction", { ...item, title: "Demo QA after finish" });
  res(M, "Syllabus", "Add to 2025-26 after Finish correction", "Principal (Sunrise)", "Refused again: the year is closed", msg(r), refused(r) && /closed/i.test(r.text) ? "PASS" : "FAIL");
} else {
  res(M, "Syllabus", "Make a correction button on a closed year", "Principal (Sunrise)", "Shown to the Principal", "not found", "FAIL");
}
await open(tt, `/academic-management/syllabus?year=${y25}`);
res(M, "Syllabus", "Class teacher views closed 2025-26", "Class Teacher (Sunrise)", "No Make a correction button", (await tt.locator("button", { hasText: "Make a correction" }).count()) ? "button shown" : "not shown", (await tt.locator("button", { hasText: "Make a correction" }).count()) ? "FAIL" : "PASS");

// 5. Promotion: Nursery A (2026-27) to LKG (2027-28).
await open(tt, "/student-management/promotion");
await tt.waitForURL((u) => !u.pathname.endsWith("/promotion"), { timeout: 20000 }).catch(() => {});
res(SM, "Promotion", "Class teacher opens Promotion", "Class Teacher (Sunrise)", "Not allowed (sent back to Students)", tt.url().replace(/^https?:\/\/[^/]+/, ""), !/\/promotion/.test(tt.url()) ? "PASS" : "FAIL");
r = await callFormAction(tt, P, "confirmPromotionAction", { fromSectionId: nurseryA, toYearId: y27, toClassId: "", decisions: "[]" });
res(SM, "Promotion", "Class teacher confirms a promotion (crafted call)", "Class Teacher (Sunrise)", "Refused", msg(r), refused(r) || /not|cannot|permission/i.test(r.text) ? "PASS" : "FAIL");

await open(pr, `/student-management/promotion?fromYear=${y26}&from=${nurseryA}&toYear=${y27}`);
t = (await mainText(pr, 4000)).replace(/\s+/g, " ");
res(SM, "Promotion", "Review Nursery A to 2027-28", "Principal (Sunrise)", "Each student with a suggestion and why", t.slice(0, 300), /LKG/.test(t) && /Promote/i.test(t) ? "PASS" : "FAIL");
// Change one decision away from the suggestion without a reason: Review and confirm is blocked.
const sel = pr.locator("li select").first();
if (await sel.count()) {
  const cur = await sel.inputValue();
  const other = cur === "DETAIN" ? "PROMOTE" : "DETAIN";
  await sel.selectOption(other).catch(() => {});
  const blocked = await pr.locator("button", { hasText: "Review and confirm" }).isDisabled();
  t = (await mainText(pr, 4000)).replace(/\s+/g, " ");
  res(SM, "Promotion", "Change one decision from the suggestion with no reason", "Principal (Sunrise)", "Review and confirm is held back; asks for a reason", `${blocked ? "button disabled" : "button enabled"}; ${t.match(/[^.]*reason[^.]*\./i)?.[0] ?? ""}`, blocked ? "PASS" : "FAIL");
  r = await callFormAction(pr, P, "confirmPromotionAction", { fromSectionId: nurseryA, toYearId: y27, toClassId: "", decisions: "[]" });
  res(SM, "Promotion", "Confirm with no decisions (crafted call)", "Principal (Sunrise)", "Refused: choose a decision for each student", msg(r), refused(r) && /Choose a decision/.test(r.text) ? "PASS" : "FAIL");
  await pr.locator("button", { hasText: "Use every suggestion" }).click();
}
await pr.locator("button", { hasText: "Review and confirm" }).click();
await pr.locator("button", { hasText: "Confirm and save" }).click();
await pr.waitForURL(/\/promotion\/[0-9a-f-]{36}/, { timeout: 120000 }).catch(() => {});
t = (await mainText(pr, 3000)).replace(/\s+/g, " ");
const after = statusOf();
res(SM, "Promotion", "Confirm and save the Nursery A batch", "Principal (Sunrise)", "Saved; students promoted to LKG 2027-28; last year's record kept", `${pr.url().replace(/^https?:\/\/[^/]+/, "")} | ${t.slice(0, 160)} | ${after}`, /\/promotion\/[0-9a-f-]{36}/.test(pr.url()) && /PROMOTED/.test(after) ? "PASS" : "FAIL");
const into = SPS(`select c.name, x.name, count(*) from enrolment e join section x on x.id=e.section_id join school_class c on c.id=x.class_id where e.academic_year_id='${y27}' and e.archived_at is null and e.student_id in (select student_id from enrolment where section_id='${nurseryA}') group by 1,2;`).replace(/\s+/g, " ");
res(SM, "Promotion", "Where the students went", "Principal (Sunrise)", "LKG section in 2027-28 with roll numbers", into, /LKG/.test(into) ? "PASS" : "FAIL");
r = await callFormAction(pr, P, "confirmPromotionAction", { fromSectionId: nurseryA, toYearId: y27, toClassId: "", decisions: "[]" });
res(SM, "Promotion", "Promote Nursery A again", "Principal (Sunrise)", "Refused: everyone is already in 2027-28", msg(r), /already in 2027-28/.test(r.text) ? "PASS" : "FAIL");

// 6. Undo (leaves Sunrise as it was).
const undo = pr.locator("button", { hasText: "Undo this promotion" }).first();
if (await undo.count()) {
  await undo.click();
  await pr.locator("dialog[open] button", { hasText: "Undo promotion" }).click();
  await pr.waitForTimeout(5000);
  const back = statusOf();
  res(SM, "Promotion", "Undo this promotion", "Principal (Sunrise)", "Students back to Studying in Nursery A; batch kept as Undone", back, !/PROMOTED/.test(back) && /STUDYING/.test(back) ? "PASS" : "FAIL");
} else {
  res(SM, "Promotion", "Undo this promotion", "Principal (Sunrise)", "Undo button on the batch", "not found", "FAIL");
}

await pr.setViewportSize(VIEWPORTS.phone375);
for (const url of [`/student-management/promotion?fromYear=${y26}&from=${nurseryA}&toYear=${y27}`, "/academic-management/settings", `/academic-management/syllabus?year=${y25}`]) {
  await open(pr, url);
  const li = await layoutIssues(pr);
  res(url.includes("student") ? SM : M, url.includes("promotion") ? "Promotion" : url.includes("settings") ? "Academic Settings" : "Syllabus", `${url.split("?")[0]} at 375px`, "Principal (Sunrise)", "No sideways scroll", li.join("; ") || "no issues", li.length ? "FAIL" : "PASS");
}
await close();
