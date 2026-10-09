// Each module adds its demo data here, one line per module, in build order.
import type { ModuleSeed } from "./types";
import { seedStaffHr } from "./staff-hr";

export const MODULE_SEEDS: { module: string; seed: ModuleSeed }[] = [
  { module: "staff-hr-management", seed: seedStaffHr },
];
