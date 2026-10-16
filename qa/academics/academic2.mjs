// Academic Management, remaining pages (server actions on the base build plus screens), as the
// Academic Head: Subjects (add, validation, duplicate code, edit, archive), Teacher Allocation
// (assign, validation, end), Syllabus (add, validation, archive); Teacher refused; Vice Principal
// and Academic Head views; Settings page; 375px.
import { mainText, shot, close, layoutIssues, VIEWPORTS } from "../lib.mjs";
import { res, login, open, sql, uuidOf } from "./r.mjs";
import { callAction, callFormAction } from "./action.mjs";

const M = "Academic Management";
const S = "src/app/(school)/academic-management/subjects/actions.ts";
const T = "src/app/(school)/academic-management/teacher-allocation/actions.ts";
const Y = "src/app/(school)/academic-management/syllabus/actions.ts";
const msg = (r) => `${r.text.match(/"message":"[^"]*"/)?.[0] ?? ""} ${r.text.match(/"errors":\{[^}]*\}/)?.[0] ?? ""}`.trim() || r.text.replace(/\s+/g, " ").slice(-200);
const refused = (r) => /"ok":false|"errors"/.test(r.text);
const year = "151ceaef-b5c1-4c94-a994-6eee097806af";
const G5B = uuidOf(sql(`select x.id from section x join school_class c on c.id=x.class_id where c.name='Grade 5' and x.name='B' and x.academic_year_id='${year}';`));
const c5 = uuidOf(sql(`select class_id from section where id='${G5B}';`));
const maths = uuidOf(sql("select id from subject where name='Mathematics' and archived_at is null limit 1;"));
const mathsCode = sql("select code from subject where name='Mathematics' and archived_at is null limit 1;").split("\n")[2]?.trim();
const bhavani = "0ddc078e-5049-45e5-96e7-9c73d7a49ca2";

const ah = await login("cems.academichead");
const sub = { name: "Demo QA Robotics", code: "DQR", type: "ELECTIVE", periodsPerWeek: "2", fromDate: "" };
let r = await callFormAction(ah, S, "addSubjectAction", { ...sub, name: "" });
res(M, "Subjects", "Add a subject with no name", "Academic Head", "Refused: Subject name is needed", msg(r), /Subject name is needed/.test(r.text) ? "PASS" : "FAIL");
r = await callFormAction(ah, S, "addSubjectAction", { ...sub, code: "A B!" });
res(M, "Subjects", "Code 'A B!'", "Academic Head", "Refused: letters, numbers and dashes", msg(r), /letters, numbers and dashes/.test(r.text) ? "PASS" : "FAIL");
r = await callFormAction(ah, S, "addSubjectAction", { ...sub, periodsPerWeek: "31" });
res(M, "Subjects", "31 periods per week", "Academic Head", "Refused: between 0 and 30", msg(r), /between 0 and 30/.test(r.text) ? "PASS" : "FAIL");
r = await callFormAction(ah, S, "addSubjectAction", { ...sub, code: mathsCode });
res(M, "Subjects", `Add a subject with Mathematics' code (${mathsCode})`, "Academic Head", "Refused: code in use", msg(r), refused(r) ? "PASS" : "FAIL");
const te = await login("cems.teacher");
r = await callFormAction(te, S, "addSubjectAction", sub);
res(M, "Subjects", "Teacher adds a subject (crafted call)", "Teacher", "Refused", msg(r), refused(r) || /cannot|not allowed/i.test(r.text) ? "PASS" : "FAIL");
r = await callFormAction(ah, S, "addSubjectAction", sub);
res(M, "Subjects", "Add Demo QA Robotics (DQR, elective, 2 a week)", "Academic Head", "Added", msg(r), /added/.test(r.text) ? "PASS" : "FAIL");
const robo = uuidOf(sql("select id from subject where name='Demo QA Robotics' and archived_at is null;"));
r = await callFormAction(ah, S, "updateSubjectAction", { id: robo, name: "Demo QA Robotics Lab", code: "DQR", type: "ELECTIVE" });
res(M, "Subjects", "Rename to Demo QA Robotics Lab", "Academic Head", "Saved", msg(r), /saved/.test(r.text) ? "PASS" : "FAIL");
r = await callAction(ah, S, "archiveSubjectAction", [robo]);
res(M, "Subjects", "Archive the Demo subject", "Academic Head", "Archived", r.text.replace(/\s+/g, " ").slice(-160), !/"ok":false/.test(r.text) && /archiv/i.test(r.text + sql(`select archived_at is not null from subject where id='${robo}';`)) ? "PASS" : "FAIL");

// Teacher Allocation
const al = { yearId: year, sectionId: G5B, subjectId: maths, staffId: bhavani, role: "secondary", periodsPerWeek: "", fromDate: "2026-11-02" };
r = await callFormAction(ah, T, "assignAction", { ...al, staffId: "" });
res(M, "Teacher Allocation", "Assign with no teacher", "Academic Head", "Refused: Choose a teacher", msg(r), /Choose a teacher/.test(r.text) ? "PASS" : "FAIL");
r = await callFormAction(ah, T, "assignAction", { ...al, periodsPerWeek: "abc" });
res(M, "Teacher Allocation", "Periods per week 'abc'", "Academic Head", "Refused: whole number", msg(r), /whole number/.test(r.text) ? "PASS" : "FAIL");
r = await callFormAction(te, T, "assignAction", al);
res(M, "Teacher Allocation", "Teacher assigns a teacher (crafted call)", "Teacher", "Refused", msg(r), refused(r) || /cannot/i.test(r.text) ? "PASS" : "FAIL");
r = await callFormAction(ah, T, "assignAction", al);
res(M, "Teacher Allocation", "Assign Demo Bhavani Kalla (already 40 periods) as second Maths teacher of 5 B", "Academic Head", "Warned: over the period limit; asks for a reason", msg(r), /limit 32/.test(r.text) ? "PASS" : "FAIL");
r = await callFormAction(ah, T, "assignAction", { ...al, overLimitReason: "Demo: QA test, ended at once" });
res(M, "Teacher Allocation", "Assign again with a reason for going over the limit", "Academic Head", "Assigned", msg(r), !refused(r) ? "PASS" : "FAIL");
const alloc = uuidOf(sql(`select id from teacher_allocation where staff_id='${bhavani}' and section_id='${G5B}' and subject_id='${maths}' and archived_at is null order by created_at desc limit 1;`));
r = await callFormAction(ah, T, "assignAction", { ...al, overLimitReason: "Demo: again" });
res(M, "Teacher Allocation", "Assign the same teacher again", "Academic Head", "Refused: already assigned", msg(r), refused(r) ? "PASS" : "FAIL");
if (alloc) {
  r = await callFormAction(ah, T, "endAllocationAction", { allocationId: alloc, from: "2026-11-01" });
  res(M, "Teacher Allocation", "End the Demo assignment (before it starts)", "Academic Head", "Ended; history kept", msg(r), !refused(r) ? "PASS" : "FAIL");
}

if (process.env.ONLY_SUBJECTS) { await close(); process.exit(0); }
// Syllabus
const item = { yearId: year, classId: c5, subjectId: maths, kind: "CHAPTER", title: "Demo QA Chapter: Fractions revision", plannedFrom: "2026-11-02", plannedTo: "2026-11-13" };
r = await callFormAction(ah, Y, "addItemAction", { ...item, title: "" });
res(M, "Syllabus", "Add a chapter with no title", "Academic Head", "Refused: Give a title", msg(r), /Give a title/.test(r.text) ? "PASS" : "FAIL");
r = await callFormAction(ah, Y, "addItemAction", { ...item, plannedFrom: "2026-11-13", plannedTo: "2026-11-02" });
res(M, "Syllabus", "Planned end before planned start", "Academic Head", "Refused in plain words", msg(r), refused(r) ? "PASS" : "FAIL", refused(r) ? undefined : "ACADEMICS-22");
r = await callFormAction(ah, Y, "addItemAction", item);
res(M, "Syllabus", "Add Demo QA Chapter to Grade 5 Maths", "Academic Head", "Added", msg(r), /added/.test(r.text) ? "PASS" : "FAIL");
r = await callFormAction(te, Y, "addItemAction", { ...item, title: "Demo QA teacher chapter" });
res(M, "Syllabus", "Teacher adds a syllabus item (crafted call)", "Teacher", "Refused", msg(r), refused(r) || /cannot/i.test(r.text) ? "PASS" : "FAIL");
const ids = sql("select id from syllabus_item where title like 'Demo QA%' and archived_at is null;").match(/[0-9a-f]{8}-[0-9a-f-]{27}/g) ?? [];
for (const id of ids) { r = await callAction(ah, Y, "archiveItemAction", [id]); console.log("archived syllabus item:", r.text.slice(-120)); }

// Views by role
for (const [who, role] of [["cems.viceprincipal", "Vice Principal"], ["cems.academichead", "Academic Head"]]) {
  const p = await login(who);
  for (const [url, page] of [["/academic-management", "Classes"], ["/academic-management/subjects", "Subjects"], ["/academic-management/teacher-allocation", "Teacher Allocation"], ["/academic-management/settings", "Academic Settings"]]) {
    await open(p, url);
    const t = (await mainText(p, 600)).replace(/\s+/g, " ");
    res(M, page, `${role} opens ${page}`, role, "Page opens (role may be view-only)", `${p.url().replace(/^https?:\/\/[^/]+/, "")} ${t.slice(0, 120)}`, !/This page is not here|went wrong/i.test(t) ? "PASS" : "FAIL");
  }
}
await ah.setViewportSize(VIEWPORTS.phone375);
for (const url of ["/academic-management/subjects", "/academic-management/teacher-allocation", "/academic-management/syllabus"]) {
  await open(ah, url);
  const li = await layoutIssues(ah);
  res(M, url.split("/").pop(), `${url} at 375px`, "Academic Head", "No sideways scroll", li.join("; ") || "no issues", li.length ? "FAIL" : "PASS");
}
await close();
