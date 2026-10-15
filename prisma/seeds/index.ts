// Each module adds its demo data here, one line per module, in build order.
import type { ModuleSeed } from "./types";
import { seedAcademic } from "./academic";
import { seedSettings } from "./settings";
import { seedSettingsSecurity } from "./settings-security";
import { seedStaffHr } from "./staff-hr";
import { seedStudents } from "./students";
import { seedCommunication } from "./communication";
import { seedAttendance } from "./attendance";
import { seedExams } from "./exams";
import { seedDashboard } from "./dashboard";
import { seedAdmission } from "./admission";
import { seedFeesFinance } from "./fees-finance";
import { seedSalary } from "./salary";
import { seedHomework } from "./homework";
import { seedFrontOffice } from "./front-office";
import { seedEvents } from "./events";
import { seedReports } from "./reports";
import { seedTransport } from "./transport";

export const MODULE_SEEDS: { module: string; seed: ModuleSeed }[] = [
  { module: "academic-management", seed: seedAcademic },
  { module: "settings", seed: seedSettings },
  { module: "settings (gateways, consent, backups)", seed: seedSettingsSecurity },
  { module: "staff-hr-management", seed: seedStaffHr },
  { module: "student-management", seed: seedStudents },
  { module: "communication", seed: seedCommunication },
  { module: "attendance-management", seed: seedAttendance },
  { module: "examination-results", seed: seedExams },
  { module: "dashboard", seed: seedDashboard },
  { module: "admission-management", seed: seedAdmission },
  { module: "fee-management and finance-management", seed: seedFeesFinance },
  { module: "salary-management", seed: seedSalary },
  { module: "homework-learning", seed: seedHomework },
  { module: "front-office", seed: seedFrontOffice },
  { module: "events-calendar", seed: seedEvents },
  { module: "reports-analytics", seed: seedReports },
  { module: "transport-management", seed: seedTransport },
];
