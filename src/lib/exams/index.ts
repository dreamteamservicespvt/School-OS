// Examination & Results: the server layer. Pages import from the files
// directly; other modules use these hand-offs.
import "server-only";

export { studentExamsTab, finalOutcomes, type StudentExamsTab } from "./profile";
export { parentDatesheets, parentReportCards, parentReportCardPdf, type ParentDatesheet, type ParentReportCard } from "./parent-link";
export { registerAttendanceSource, type AttendanceDays } from "./attendance";
export { examScope, type ExamScope } from "./scope";
