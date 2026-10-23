// Findings from the attendance and student leave runs (01 to 07).
import { finding, OUT } from "./h.mjs";
import path from "node:path";
const S = (n) => path.join(OUT, "shots", `${n}.png`);

finding({
  id: "TEACHING-01", severity: "major", school: "Sunrise", role: "teacher (Class Teacher), principal", viewport: "phone390",
  page: "/attendance-management?section=<Class 5 A>&date=2026-10-18",
  steps: [
    "Today is Sunday 18-10-2026, inside the School Calendar vacation 'Dasara holidays' (17 to 25 Oct, attendance off).",
    "Two ordinary events are on the calendar that day: 'Fire drill' and 'Staff meeting' (type event; their 'Allow attendance on this date' switch is on, which is the form's default for an event).",
    "Sign in as teacher on a phone and open the home screen, then Take Attendance.",
  ],
  expected: "05-attendance §5 and workflow 5: on a holiday or Sunday Take Attendance is off with the banner 'Holiday: Dasara holidays. Attendance is off for 18-10-2026.', the day is left out of every %, and no absence message goes. Only a person deliberately allowing attendance for that date in the School Calendar opens it.",
  actual: "Take Attendance opens normally ('Not saved yet. Everyone starts as present'), saving works and queues absence messages to parents ('Parents of 2 absent students get a message at 4:40 AM'). The register counts Sunday 18 Oct as a school day ('13 school days so far', a 'Su' column with marks). Student Leave counts the day ('1 day of school (Sundays and holidays not counted)' for a leave on Sun 18 Oct; a leave 27 Oct to 2 Nov is '7 days of school' because an 'Inter-house debate' event is on Sunday 1 Nov; it should be 6). The home screen contradicts itself: header 'Dasara holidays · no school today' and 'Today: Dasara holidays · school closed', but 'Needs your attention: Take attendance for Class 5 A, Locks at 11:00 AM'. The Principal's whole-school register lists 19 classes 'Not marked yet' with 'Remind all'. Saturday 17 Oct (same vacation, no event) is correctly off.",
  screenshot: S("look-teacher-phone390-_attendance_management"),
  suspected_code: "src/lib/attendance/calendar.ts schoolDays(): `if (e.attendanceOn) allowed.add(k)` treats ANY calendar entry with attendanceOn (every event, exam day, PTM: default on) as 'allow attendance', overriding vacations, holidays and Sundays. The Events module (src/lib/events/calendar.ts closesSchool, line ~216) only looks at closing entries, so the two modules disagree. Only holiday/vacation entries with attendanceOn should re-open a day.",
});

finding({
  id: "TEACHING-02", severity: "major", school: "Sunrise", role: "teacher (Class Teacher)", viewport: "phone390",
  page: "/attendance-management/student-leave, /attendance-management, /attendance-management/register",
  steps: [
    "Take Attendance for Class 5 A on 18-10-2026 and save (Kabir Sharma Present).",
    "Student Leave > Record leave: Kabir Sharma, Medical, 18-10-2026, reason 'Fever, doctor advised rest', Approve now on. Toast: 'Leave recorded and approved (1 day). It shows as Leave in Take Attendance'.",
    "Open Take Attendance for that day, then the Attendance Register.",
  ],
  expected: "Workflow 6 step 5: on approved days the student shows as Leave in Take Attendance AND in the register, and the % treats it as leave. One screen, one set of numbers.",
  actual: "Take Attendance shows Kabir greyed 'On approved leave · Leave', but the count tiles still say '13 Present ... 0 Leave' and the Save button says 'Save attendance: 13 present, 2 absent, 1 late' (Kabir counted as present). The register shows Kabir 'P' on 18 Oct and the database mark stays 'present'. Only after the teacher changes some other student and saves again does the mark become Leave (toast then says '12 present, 2 absent, 1 late, 1 leave' while the tiles still show 13/0). A leave approved after the day was saved leaves the register wrong until someone happens to re-save; the teacher cannot see it because the row is locked as Leave.",
  screenshot: S("leave-phone390-list"),
  suspected_code: "src/lib/attendance/student-leave.ts (approve does not update Attendance Marks already saved for those dates); take-sheet.tsx counts use the saved mark, not the leave",
});

finding({
  id: "TEACHING-03", severity: "minor", school: "Sunrise", role: "teacher (Class Teacher)", viewport: "phone390",
  page: "/attendance-management/register",
  steps: ["Sign in as teacher on a 390px phone.", "Open Attendance Register (Class register, October 2026).", "Swipe the page sideways."],
  expected: "Only the register grid scrolls sideways inside its card; the page itself stays 390px wide (00-global, phone layout).",
  actual: "The whole page is 720px wide: it slides sideways into empty grey space, the header and bottom bar stay at 390px. layoutIssues: 'page scrolls sideways (720px > 390px)'. Cause: the hidden screen-reader label in each Holiday cell ('Akshara Pillai, 17 October 2026: Dasara holidays', class sr-only, position absolute) is positioned against <main>, outside the grid's overflow-x-auto box, so the farthest holiday column widens the page.",
  screenshot: S("width-phone390-_attendance_management_register"),
  suspected_code: "src/app/(school)/attendance-management/register/page.tsx line ~208: holiday <td>/<span> has no `relative`, so its <span className=\"sr-only\"> escapes the scroller",
});

finding({
  id: "TEACHING-04", severity: "polish", school: "Sunrise", role: "teacher (Class Teacher)", viewport: "phone390",
  page: "/attendance-management/register/absences",
  steps: [
    "Save attendance for 18-10-2026 with Bhavya Bhat absent (absence reasons off).",
    "As principal switch on Attendance Settings > More options > Absence reasons.",
    "Open Take Attendance (Bhavya shows 'Reason: Not known yet'), save again without touching Bhavya.",
    "Open Attendance Register > Absent list.",
  ],
  expected: "The same mark has the same words everywhere. 05-attendance: 'Saving without choosing keeps \"Not known yet\"'; marks from before reasons were on show 'Not recorded'.",
  actual: "Take Attendance says 'Reason: Not known yet' for Bhavya, the Absent list says 'Class 5 A · Not recorded' for the same mark (database reason empty), while the Absent list's own tile counts her under 'Reason not known yet 1'. Three different words for one mark.",
  screenshot: S("reasons-absent-list"),
  suspected_code: "src/lib/attendance/marks.ts (unchanged absent marks are not given 'not-known' on save once reasons are on) / absence-reasons.ts shownReason",
});

finding({
  id: "TEACHING-05", severity: "polish", school: "Sunrise", role: "teacher (Class Teacher)", viewport: "phone390",
  page: "/attendance-management/student-leave (Record leave)",
  steps: ["Record leave: choose a student, From 27-10-2026, To 26-10-2026, reason typed.", "Press Record leave."],
  expected: "One clear message next to the To date (P-patterns: one error per field).",
  actual: "The same sentence 'To date is before the from date. Choose a to date on or after the from date.' is shown four times in the small phone dialog: at the top, under From, under To, and in the live preview line. Same for the overlap message 'Kabir already has leave from 18-10-2026 to 18-10-2026. Change the existing leave instead.' (top, From, To, preview).",
  screenshot: S("leave-phone390-kabir"),
  suspected_code: "src/app/(school)/attendance-management/_components/leave-ui.tsx (error attached to both from and to plus the form message and LivePreview)",
});
