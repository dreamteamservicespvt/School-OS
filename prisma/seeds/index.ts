// Each module adds its demo data here, one line per module, in build order.
import type { ModuleSeed } from "./types";
import { seedStudents } from "./students";

export const MODULE_SEEDS: { module: string; seed: ModuleSeed }[] = [
  { module: "student-management", seed: seedStudents },
];
