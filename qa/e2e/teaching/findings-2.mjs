// Findings from the absence message timing and staff leave runs (08 to 11).
import { finding, OUT } from "./h.mjs";
import path from "node:path";
const S = (n) => path.join(OUT, "shots", `${n}.png`);

finding({
  id: "TEACHING-06", severity: "major", school: "Sunrise", role: "teacher (Class Teacher)", viewport: "phone390",
  page: "/attendance-management (Take Attendance) -> absence message",
  steps: [
    "Take Attendance, Class 5 A, 18-10-2026: mark Ishaan Mehta Absent by mistake and save at 23:18:58 UTC (04:48 IST). The toast promises the message 15 minutes later.",
    "Within a minute any other request in the app runs the job queue (here a scheduler call to /api/v1/jobs/tick, which deploy/vercel calls every few minutes).",
    "At 04:51 IST the teacher notices and changes Ishaan to Present, saves.",
  ],
  expected: "05-attendance A4 step 2 and §5: absence messages go after a short wait (15 minutes, Attendance Settings) 'so a teacher's quick correction does not send a wrong message'.",
  actual: "The parent got the absence message 35 seconds after the save: background_job attendance-after-save run_after 23:33:58 UTC finished 23:19:33 UTC; message_recipient 'Ravi Mehta ... Ishaan Mehta (Class 5 A) ఈరోజు 18-10-2026 పాఠశాలకు హాజరు కాలేదు' DELIVERED 23:19:33. The correction 2 minutes later was too late; a present child's parent was told he was absent. Earlier, a job with run_after 23:26:13 also ran at 23:17:24. Cause: delayed jobs run up to 5½ hours early whenever the database's time zone is not UTC. This server's PostgreSQL TimeZone is Asia/Calcutta (an Indian school's own server is likely to be the same).",
  screenshot: "",
  suspected_code: "prisma/schema/migrations/20261009125023_platform/migration.sql claim_background_jobs(): `j.run_after <= now()` compares a UTC `timestamp without time zone` with now() read in the session time zone (Asia/Calcutta here). Use `now() AT TIME ZONE 'UTC'` / timestamptz, or set the connection TimeZone to UTC. Affects every delayed job (absence messages, scheduled messages, reminders).",
});

finding({
  id: "TEACHING-07", severity: "minor", school: "Sunrise", role: "principal", viewport: "phone390",
  page: "/approvals/<id> (Staff leave)",
  steps: ["subjectteacher applies for Casual Leave on 28-10-2026 (balance 12 of 12).", "Principal opens the request from Approvals."],
  expected: "Workflow 7 step 3: 'The request waits in the principal's Approvals, with the leave balance and the periods that will need cover.'",
  actual: "The approval shows the periods ('6 periods need substitutes') but not the leave balance anywhere (list card or detail page: Kind, Waiting for, Step 2, Reason, History). The Principal has to open the teacher's profile to see 'Casual Leave 12 of 12 left'. The detail also says 'Step 2' for a one-step request.",
  screenshot: S("look-principal-phone390-_approvals_a4bc90d3_8b80_4845_a538_944779031f01"),
  suspected_code: "src/app/(school)/approvals/[id]/page.tsx",
});

finding({
  id: "TEACHING-08", severity: "polish", school: "Sunrise", role: "subjectteacher (Teacher)", viewport: "phone390",
  page: "/staff-hr-management/leave (Cancel leave)",
  steps: ["Open My leave, press 'Cancel leave' on an approved leave."],
  expected: "Two buttons that cannot be confused (P4); Student Leave's own cancel dialog uses 'Keep it' / 'Cancel leave'.",
  actual: "The dialog's buttons are 'Cancel' and 'Cancel leave' side by side: 'Cancel' closes the dialog, 'Cancel leave' cancels the leave. Easy to tap the wrong one on a phone.",
  screenshot: S("staffleave-cancel-dialog"),
  suspected_code: "src/app/(school)/staff-hr-management/leave/leave-forms.tsx (cancel FormDialog has no cancelLabel)",
});
