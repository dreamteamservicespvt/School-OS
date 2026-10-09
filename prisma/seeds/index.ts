// Each module adds its demo data here, one line per module, in build order.
import type { ModuleSeed } from "./types";
import { seedSettingsSecurity } from "./settings-security";

export const MODULE_SEEDS: { module: string; seed: ModuleSeed }[] = [
  { module: "settings (gateways, consent, backups)", seed: seedSettingsSecurity },
];
