// Each module adds its demo data here, one line per module, in build order.
import type { ModuleSeed } from "./types";
import { seedAcademic } from "./academic";

export const MODULE_SEEDS: { module: string; seed: ModuleSeed }[] = [
  { module: "academic-management", seed: seedAcademic },
];
