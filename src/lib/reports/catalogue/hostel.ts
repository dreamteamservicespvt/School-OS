// Hostel reports in the catalogue (15 §7): the same tables as the Hostel
// Reports page (src/lib/hostel/reports.ts), so both show the same rows.
// A warden only ever sees their own hostel's names; the catalogue's reports
// are for people who read every hostel.
import "server-only";

import { HOSTEL_REPORT_LIST } from "../../hostel/reports";
import { hostelViewer } from "../../hostel/access";
import type { ReportEntry } from "../types";

export const HOSTEL_REPORTS: ReportEntry[] = HOSTEL_REPORT_LIST.map((r) => ({
  key: r.key,
  category: "Hostel",
  name: r.name,
  sub: r.sub,
  dated: r.dated,
  fallback: r.dated ? "thismonth" : undefined,
  allowed: (_a, who) => {
    if ((who.permissions["hostel-management"]?.see ?? "none") !== "all") return false;
    // A warden works in their own hostel only: whole-school hostel reports are not for them.
    return !hostelViewer({ permissions: who.permissions, roles: who.roles, user: { id: "" } }).wardenOnly;
  },
  async run(rc) {
    return r.run(rc.tx, rc.ctx, { from: rc.f.range ? rc.f.from : null, to: rc.f.range ? rc.f.to : null, today: rc.f.today, hostelIds: null, tz: rc.tz, now: new Date() });
  },
}));
