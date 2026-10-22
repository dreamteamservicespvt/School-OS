// Hostel clearance before a student leaves (15 §4 Sends: "bed clearance on
// leaving", inferred): a student who still has a hostel bed holds the
// Transfer Certificate until the warden checks them out (the bed becomes
// free and hostel fees stop). Hostel fees still due are checked by "Fees".
// Imported by src/lib/students/leaving.ts; runs only when Hostel Management
// is switched on.
import "server-only";

import { registerClearanceCheck, registerOnLeft } from "../students/clearance";
import { activeBedOf, releaseOnLeaving } from "./allocation";
import { BASE } from "./words";

registerClearanceCheck(
  "Hostel",
  async (tx, _ctx, studentId) => {
    const bed = await activeBedOf(tx, studentId);
    if (!bed) return { clear: true, detail: "Clear" };
    return { clear: false, detail: `Still has ${bed.words} in ${bed.hostel.name}`, actionHref: `${BASE}/allocation?checkout=${bed.allocation.id}`, actionLabel: "Check out of the hostel" };
  },
  { moduleKey: "hostel-management" },
);

// A student who left with the hostel check waived: the bed is freed and the hostel fees after the last date stop.
registerOnLeft("Hostel", async (tx, ctx, e) => {
  await releaseOnLeaving(tx, ctx, e.studentId, e.lastDate, e.reason);
});
