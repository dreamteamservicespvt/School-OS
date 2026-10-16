// Inventory clearance before a student leaves (14 §4, inferred): returnable
// items issued to the student (for example library-style textbooks) and not
// returned hold the TC until they are returned at the store. Charges for
// items sold are fees, checked by "Fees". Imported by
// src/lib/students/leaving.ts; runs only when Inventory Management is on.
import "server-only";

import { registerClearanceCheck } from "../students/clearance";
import { BASE } from "./words";

registerClearanceCheck(
  "Store",
  async (tx, _ctx, studentId) => {
    const lines = await tx.stockIssueLine.findMany({ where: { issue: { studentId, returnable: true } }, select: { qty: true, returnedQty: true } });
    const out = lines.reduce((a, l) => a + Math.max(0, l.qty - l.returnedQty), 0);
    if (out > 0) return { clear: false, detail: `${out} returnable store item${out === 1 ? "" : "s"} not returned`, actionHref: `${BASE}?view=issues&student=${studentId}`, actionLabel: "Record the return" };
    return { clear: true, detail: "Clear" };
  },
  { moduleKey: "inventory-management" },
);
