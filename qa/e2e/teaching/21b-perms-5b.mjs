// The class teacher of 5 B (subjectteacher) opens / saves Mathematics marks for his own class (he teaches Science, not Maths).
import { as, visit, text, VIEWPORTS, sql, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";
process.env.QA_MANIFEST = "C:/Users/chala/Desktop/School-OS/.next/server/server-reference-manifest.json";
const { callAction } = await import("../../academics/action.mjs");
const S5B = "58f4061b-667b-40fd-ae40-e7e07bdfc185", ENTRY = "31218111-601c-49d2-b3b9-c8cbdf28bd7c";
const st = await as("subjectteacher", VIEWPORTS.phone390);
const r1 = await visit(st, `/examination-results/marks/${ENTRY}/${S5B}`, 1500);
console.log("open 5 B Maths:", r1?.status(), (await text(st, 400)));
const kid = sql(`select e.student_id from enrolment e where e.section_id='${S5B}' and e.archived_at is null limit 1`)[0][0];
const r = await callAction(st, "src/app/(school)/examination-results/marks/actions.ts", "saveMarksAction", [ENTRY, S5B, [{ studentId: kid, parts: { Marks: 19 }, absent: false }]], "/examination-results/marks");
console.log("crafted saveMarks 5 B Maths:", r.status, r.text.slice(-200).replace(/\s+/g, " "));
console.log("5 B maths marks rows:", sql(`select count(*) from marks where entry_id='${ENTRY}' and section_id='${S5B}'`));
const t = await as("teacher", VIEWPORTS.phone390);
const r2 = await visit(t, `/examination-results/marks/${ENTRY}/${S5B}`, 1500);
console.log("teacher opens 5 B Maths:", r2?.status(), (await text(t, 300)));
await close();
