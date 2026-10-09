// Fee clearance before a student leaves (A14): the "Fees" check on the
// Leaving list. Imported by src/lib/students/leaving.ts. Fee Management is
// always on, so the check has no module switch.
import "server-only";

import { registerClearanceCheck } from "../students/clearance";
import { formatRupees } from "../format";
import { feeDuesCleared } from "./profile";

registerClearanceCheck(
  "Fees",
  async (tx, ctx, studentId) => {
    const r = await feeDuesCleared(tx, ctx, studentId);
    if (r.cleared) return { clear: true, detail: "Clear" };
    return {
      clear: false,
      detail: r.balancePaise > BigInt(0) ? `${formatRupees(r.balancePaise)} fees due` : "Payment waiting for verification",
      amountPaise: r.balancePaise,
      actionHref: r.link,
      actionLabel: "Collect fee",
    };
  },
);
