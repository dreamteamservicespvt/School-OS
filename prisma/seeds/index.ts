// Each module adds its demo data here, one line per module, in build order.
import type { ModuleSeed } from "./types";
import { seedAcademic } from "./academic";
import { seedSettings } from "./settings";
import { seedSettingsSecurity } from "./settings-security";
import { seedStaffHr } from "./staff-hr";
import { seedStudents } from "./students";
import { seedCommunication } from "./communication";
import { seedAttendance } from "./attendance";

export const MODULE_SEEDS: { module: string; seed: ModuleSeed }[] = [
  { module: "academic-management", seed: seedAcademic },
  { module: "settings", seed: seedSettings },
  { module: "settings (gateways, consent, backups)", seed: seedSettingsSecurity },
  { module: "staff-hr-management", seed: seedStaffHr },
  { module: "student-management", seed: seedStudents },
  { module: "communication", seed: seedCommunication },
  { module: "attendance-management", seed: seedAttendance },
];
