// Each module adds its demo data here, one line per module, in build order.
import type { ModuleSeed } from "./types";
import { seedSettings } from "./settings";
import { seedSettingsSecurity } from "./settings-security";
import { seedStaffHr } from "./staff-hr";

export const MODULE_SEEDS: { module: string; seed: ModuleSeed }[] = [
  { module: "settings", seed: seedSettings },
  { module: "settings (gateways, consent, backups)", seed: seedSettingsSecurity },
  { module: "staff-hr-management", seed: seedStaffHr },
];
