// Security alerts (Settings, Data Backup & Security): unusual logins and mass
// exports, read from the audit log so nothing can be left out.
import "server-only";

import type { Tx } from "../db";

/** An export of this many rows or more is a mass export (inferred). */
export const MASS_EXPORT_ROWS = 1000;

export { TWO_STEP_FEATURE } from "../auth/two-step";

export function daysAgo(days: number, now = new Date()) {
  return new Date(now.getTime() - days * 86_400_000);
}

export async function securityAlerts(tx: Tx, since: Date, take = 20) {
  const rows = await tx.auditLogEntry.findMany({
    where: {
      at: { gte: since },
      OR: [
        { action: { in: ["locked-after-wrong-passwords", "two-step-locked", "signed-in-new-device", "data-export-requested", "person-exported", "webhook-refused"] } },
        { action: "exported", after: { path: ["rows"], gte: MASS_EXPORT_ROWS } },
      ],
    },
    orderBy: { at: "desc" },
    take,
  });
  return rows.map((r) => {
    const after = (r.after ?? {}) as { rows?: number; title?: string };
    const kind =
      r.action === "locked-after-wrong-passwords" ? "Login locked after wrong passwords" :
      r.action === "two-step-locked" ? "Too many wrong one-time codes" :
      r.action === "signed-in-new-device" ? "Sign-in from a new device" :
      r.action === "data-export-requested" ? "Full data export asked for" :
      r.action === "person-exported" ? "One person's data exported" :
      r.action === "webhook-refused" ? "Payment confirmation with a wrong signature" :
      `Mass export: ${after.title ?? "a list"} (${after.rows?.toLocaleString("en-IN")} rows)`;
    const tone: "danger" | "warning" = ["locked-after-wrong-passwords", "two-step-locked", "webhook-refused"].includes(r.action) ? "danger" : "warning";
    return { id: r.id, at: r.at, kind, tone, userLoginId: r.userLoginId, recordId: r.recordId, device: r.device, ipAddress: r.ipAddress };
  });
}
