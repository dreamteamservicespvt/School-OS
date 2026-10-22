// Who may bring in the money and calendar records from their own module
// (workflow 15, steps 5 to 8): old dues and past receipts on Fee Management,
// past expenses on Finance Management, the holiday list on Events & Calendar.
// The person who does that work brings the file in from their own module,
// without Settings: the Accountant has Fee and Finance Full but no Settings
// (05-roles.md). Each kind is checked on the server against its own module, as
// a typed entry would be. The steps themselves are the one import engine's
// (src/lib/move-in, src/lib/imports/places.ts).
import "server-only";

import type { Current } from "../current";
import type { ModuleKey } from "../modules";
import { can } from "../permissions";
import { evCan, evViewer } from "../events/access";

/** The money and calendar imports each module offers on its own page, and the module that owns them. */
const MODULE_IMPORTS: Record<string, ModuleKey> = {
  "fee-old-dues": "fee-management",
  "fee-past-receipts": "fee-management",
  "finance-past-expenses": "finance-management",
  "calendar-holidays": "events-calendar",
};

/**
 * Why this person may not bring in (or undo) this kind from its module, in
 * plain words, or null when they may. Full reach in the owning module, as for
 * typing the same records: old dues and receipts need full Fee Management
 * (not "own"), the holiday list needs the School Calendar's full Events level.
 */
export function moduleImportRefusal(current: Pick<Current, "permissions" | "roles"> & { user: { id: string } }, key: string, action: "create" | "archive"): string | null {
  const owner = Object.hasOwn(MODULE_IMPORTS, key) ? MODULE_IMPORTS[key] : null;
  if (!owner) return "This import is not known.";
  if (!can(current.permissions, owner, action)) return "Your role cannot bring these records in. Ask your School Admin.";
  if (owner === "fee-management" && current.permissions["fee-management"].change !== "all") return "Your role can see fee status but cannot bring in old dues or receipts. Ask the accountant.";
  if (owner === "finance-management" && current.permissions["finance-management"].change !== "all") return "Your role can see Finance but cannot bring in expenses. Ask the accountant.";
  if (owner === "events-calendar" && !evCan(evViewer(current)).calendar) return "Your role cannot change the School Calendar. Ask the School Admin.";
  return null;
}
