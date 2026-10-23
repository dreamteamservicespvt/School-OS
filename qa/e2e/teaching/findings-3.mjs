// Findings from the exam, homework, Early Warnings and viewport runs (12 to 29).
import { finding, OUT } from "./h.mjs";
import path from "node:path";
const S = (n) => path.join(OUT, "shots", `${n}.png`);

finding({
  id: "TEACHING-09", severity: "major", school: "Sunrise", role: "admin, teacher (Class Teacher), principal", viewport: "phone390 / laptop1280",
  page: "/examination-results/marks/<entry>/<Class 5 A>, /examination-results/results",
  steps: [
    "Class Test October QA (Mathematics, Class 5, paper 16-10-2026): the teacher submits all 16 marks; Results says 'Ready to publish. All marks are in for Class 5 A.'",
    "On 18-10-2026 the School Admin adds a new student, Tanvi Latejoin, to Class 5 A (Student Management, Add student).",
    "Open Marks Entry for that paper and the Results page.",
  ],
  expected: "08-examination §Marks Entry and §Results (gap list G23): a student who joined after the paper's marks were submitted shows 'Joined late' with no marks, is shown as 'Joined after this exam', is left out of that exam and does not stop the results being published; late marks go through Approvals.",
  actual: "Tanvi shows an ordinary locked '—' cell ('Tanvi Latejoin: no mark. Ask for a change.'), no 'Joined late'. Results drop back to 'Draft. 1 subject has missing marks in Class 5 A: Mathematics' (16 of 17 complete), so the class can no longer be published. The already published Unit Test 2 of September also now says '16 of 17 complete' and Marks Entry shows Unit Test 2 Class 5 A as '17 of 17 · locked' though she has no marks. The only way out was for the Principal to 'Send back to teacher' and the teacher to mark her ML, which puts a medical-leave mark on a test she never sat. Note: the G23 late-joiner work was merged (ca1b898) after the build under test, so this may already be fixed in the source; the running build does not have it.",
  screenshot: S("late-marks-phone"),
  suspected_code: "src/app/(school)/examination-results/marks/[entryId]/[sectionId]/page.tsx, src/lib/exams/compute.ts (late joiners); build predates merge ca1b898",
});

finding({
  id: "TEACHING-10", severity: "major", school: "Sunrise", role: "teacher (Class Teacher)", viewport: "phone390",
  page: "/examination-results/report-cards (Remarks, Suggest remarks)",
  steps: [
    "Report Cards > Remarks for Class 5 A, Class Test October QA (one Mathematics paper). Press 'Suggest remarks' (AI teacher assistant is on).",
    "Read the suggestions for Tanvi Latejoin (joined after the test, marked ML) and Ananya Verma (absent for the test, AB; first in class in Unit Test 2 with 76.8%).",
  ],
  expected: "README rule 4 and 08 §Report Cards: AI 'never invents facts. It uses only the school's real data'; a remark is drafted 'from their marks and attendance'. A student with no marks gets no judgment, or a draft that says there are no marks.",
  actual: "Tanvi: 'Suggestion: Tanvi needs more support and regular practice. From this exam's marks.' She has no marks at all (ML, joined 18-10). Ananya: 'Ananya needs more support and regular practice. Regular in attendance. From this exam's marks and attendance.' Her only 'mark' is AB (absent), counted as 0; she was the class topper in the previous exam. A teacher pressing 'Use this' puts a negative remark on two report cards that parents see, with no data behind it.",
  screenshot: S("remarks-suggest-phone"),
  suspected_code: "draftRemarksAction in src/app/(school)/examination-results/report-cards/actions.ts (AB and ML treated as low marks)",
});

finding({
  id: "TEACHING-11", severity: "major", school: "Sunrise", role: "teacher", viewport: "phone390, tablet768",
  page: "/homework-learning/submissions?hw=<id>",
  steps: ["Open Submissions & Grading for a homework on a phone (390) or a tablet (768).", "Try to mark several students Complete at once (work checked in class)."],
  expected: "Workflow 9 step 6: 'The whole class can be updated at once'; 17 §9 Done when 4: 'A teacher marks 30 students Complete in one bulk action with a preview, and can undo it.' Workflow 9 says the teacher works on the phone.",
  actual: "On phone and tablet the list has no tick boxes and no 'Mark Complete' (0 visible selection controls); each student must be opened and saved one by one. On a laptop (1280) the same page has tick boxes, 'Mark Complete' with a clear preview ('Akshara Pillai Assigned → Complete') and a working Undo.",
  screenshot: S("hw-subs-tablet768"),
  suspected_code: "src/app/(school)/homework-learning/submissions/page.tsx (DataList select only rendered in the table layout)",
});

finding({
  id: "TEACHING-12", severity: "major", school: "Sunrise", role: "principal", viewport: "phone390, laptop1280",
  page: "/reports-analytics/early-warnings (Looking ahead)",
  steps: [
    "School Admin switches on Settings > Modules > AI features: Forecasts and Student insights. Looking ahead fills (38 suggestions).",
    "Principal presses 'Add for review' on 'Harini Mishra (Class 1 A) may be thinking of leaving', or 'Not a concern' on 'Vihaan Varma (Class 1 B) may be thinking of leaving'.",
  ],
  expected: "Gap list (Prediction): every item 'changes nothing until a person picks Add for review or Not a concern'; 19 §Early Warnings: AI signals can be closed as not a concern.",
  actual: "Both buttons answer 'That suggestion was not found.' for every 'may be thinking of leaving' suggestion (all 15 here; every one has a '+' in its key), so a person can neither send them for review nor dismiss them; they stay on the page and on the Dashboard card. Other kinds work (Class 2 'Not a concern' and Harini's attendance 'Add for review' were saved).",
  screenshot: S("ahead-principal-phone"),
  suspected_code: "src/app/(school)/reports-analytics/actions.ts aiDecisionAction: key check /^[\\w:.-]{1,200}$/ rejects the '+' in keys like 'leaving-f:<student>:attendance+fees+marks:2026-10' (src/lib/reports/forecasts.ts)",
});

finding({
  id: "TEACHING-13", severity: "minor", school: "Sunrise", role: "principal (exam in-charge)", viewport: "laptop1280",
  page: "/examination-results/datesheet/<id> (Publish datesheet)",
  steps: ["Create a datesheet whose only paper was on 16-10-2026 (a class test already held), publish it on 18-10-2026 with the default 'Message parents now' on."],
  expected: "Exam reminders tell parents about exams to come (workflow 8 step 5). For papers already held, no 'starts on' message, or the option off by default with a word that the dates are past.",
  actual: "29 parents got 'Dear Ramesh Iyer, Class Test October QA for Ayaan Iyer (Class 5 A) starts on 16-10-2026. The datesheet is on your Parent Link.' two days after the test. The publish dialog gave no hint that every paper was already in the past.",
  screenshot: S("ds-publish-dialog"),
  suspected_code: "src/lib/exams/datesheet.ts (publish, datesheet-published message)",
});

finding({
  id: "TEACHING-14", severity: "minor", school: "Sunrise", role: "teacher", viewport: "phone320",
  page: "/examination-results/marks/<entry>/<section> (One at a time)",
  steps: ["On a 320×640 phone open an open paper in Marks Entry (One at a time).", "Scroll so the number keys and Next are on screen."],
  expected: "08 §Marks Entry: 'On a phone: one student at a time with large number keys and Next'; the person sees what they typed.",
  actual: "With the keys and Next visible, the student's name and the 'Marks / 20' box are above the screen (box top at -46px); keys 1-3 sit under the header. The teacher types each mark blind or scrolls up and down for every student. At 390×844 it fits.",
  screenshot: S("keypad-phone320-next-in-view"),
  suspected_code: "src/app/(school)/examination-results/marks/marks-grid.tsx OneAtATime layout",
});

finding({
  id: "TEACHING-15", severity: "minor", school: "Sunrise", role: "teacher (Class Teacher)", viewport: "phone390",
  page: "/reports-analytics/early-warnings, /dashboard",
  steps: ["With Forecasts on, Looking ahead has 'Akshara Pillai (Class 5 A) may fall below the pass mark in the next exam'.", "Sign in as Ravi Teja, class teacher of Class 5 A; open Early Warnings and the home screen."],
  expected: "19 §Early Warnings: AI signals are part of Early Warnings, and 'A class teacher sees only their students; the Principal sees all'. Class Teacher is ticked under AI assistant 'Roles that may use it'.",
  actual: "The class teacher sees no Looking ahead at all, not even the suggestion about his own student; only the Principal/School Admin (Full reports) see it.",
  screenshot: S("vp-teacher-phone320-_reports_analytics_early_warnings"),
  suspected_code: "src/lib/reports/access.ts: `const ai = who.features.has(\"ai-assistant\") && leader;`",
});

finding({
  id: "TEACHING-16", severity: "minor", school: "Sunrise", role: "teacher (Class Teacher)", viewport: "tablet768",
  page: "/attendance-management (Take Attendance)",
  steps: ["Open Take Attendance for Class 5 A on a 768px tablet."],
  expected: "Names readable enough to tell students apart; count tiles readable (00-global, tablet layout).",
  actual: "The two-column list cuts names to about six letters: 'Shreya...' (Shreya Mehta and Shreya Nair), 'Ishaan ...' (Ishaan Mehta and Ishaan Naidu), 'Pooja ...' (Pooja Pillai and Pooja Verma) look the same; absence reasons show only 'Reason: ...'. The count tiles wrap '12' onto two lines and cut labels to 'Pr...', 'A...', 'La...', 'Le...', 'N...'. Only the roll number tells the two Shreyas apart. Laptop and phone are fine.",
  screenshot: S("vp-teacher-tablet768-_attendance_management_section_b07ca58e_2716_4729_"),
  suspected_code: "src/app/(school)/attendance-management/_components/take-sheet.tsx (md:grid-cols-2 at 768 with the sidebar)",
});

finding({
  id: "TEACHING-17", severity: "minor", school: "Sunrise", role: "principal", viewport: "phone390",
  page: "/approvals/<id> (Attendance correction)",
  steps: ["Teacher asks to change Akshara Pillai on 16-10-2026 from Present to Absent.", "Principal opens Approvals and the request."],
  expected: "The approver sees what will change before approving (P-patterns; 05-attendance: correction 'pick the date and student, the new status and a reason').",
  actual: "The list card and the detail page show only 'Attendance correction: Class 5 A, 16-10-2026 (Akshara Pillai)' and the reason; the old and new mark (Present → Absent) are only on a separate page behind 'Open the correction'. The Principal can approve without seeing the change.",
  screenshot: S("corr-approvals-phone"),
  suspected_code: "src/app/(school)/approvals/[id]/page.tsx, approval summary for attendance-correction",
});

finding({
  id: "TEACHING-18", severity: "polish", school: "Sunrise", role: "principal, teacher", viewport: "laptop1280",
  page: "/examination-results/admit-cards/pdf, /examination-results/report-cards/pdf",
  steps: ["Print the Class 5 A admit cards and a report card."],
  expected: "08 §Admit Cards: father's and mother's name and signature lines for the student, class teacher and the school's chosen signatory; numbers kept whole.",
  actual: "Admission number breaks in the middle on both PDFs ('SPS/2021/018' then '0' on the next line). The admit card has no father's or mother's name and no school signatory line (only Student and Class teacher). One card per A4 page.",
  screenshot: S("admit-class-p1"),
  suspected_code: "admit card and report card PDF templates",
});

finding({
  id: "TEACHING-19", severity: "polish", school: "Sunrise", role: "principal", viewport: "laptop1280",
  page: "/attendance-management/reports (Today)",
  steps: ["After Class 5 A is saved (12 present, 1 late, 2 absent, 1 on leave, 1 not marked), open Attendance Reports."],
  expected: "A count and its % agree.",
  actual: "'Students present 13 of 16 · 86.7%': 13 of 16 is 81%; the % leaves out the student on leave but the 'of 16' keeps her. The marks-entry phone view also shows a grade for an invalid mark (25 out of 20 shows 'Grade A1' next to the red error).",
  screenshot: "",
  suspected_code: "src/lib/attendance/reports.ts (today tiles)",
});

finding({
  id: "TEACHING-20", severity: "polish", school: "Sunrise", role: "principal", viewport: "laptop1280",
  page: "/reports-analytics/early-warnings (Looking ahead)",
  steps: ["Read the 'Cash may run short' and 'thinking of leaving' suggestions."],
  expected: "Rounded amounts in an estimate; plain words (00-global §9).",
  actual: "'Expected fees this month: about ₹9,92,346.54' (paise in an 'about' figure); 'open early warnings in 3 areas (attendance and marks and fees)'; attendance flag basis reads 'Based on: Attendance Flag, raised 14-10-2026' (a record name, not a school word).",
  screenshot: "",
  suspected_code: "src/lib/reports/forecasts.ts, src/lib/reports/warnings.ts",
});
