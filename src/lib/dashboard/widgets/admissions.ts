// Admission Management on the Dashboard: new enquiries this week, follow-up
// calls that are due or late, and applications waiting for a decision. Each
// count is the same filter as the Enquiries or Applications list it opens.
// The Receptionist (own reach) sees only the enquiries they own or added;
// applications need full reach (src/lib/admission/access.ts).
import "server-only";

import { readListParams } from "../../list";
import { viewerFor, type ViewerSource, type Viewer as AdmissionViewer } from "../../admission/access";
import { applicationWhere, enquiryWhere, ENQUIRY_FILTERS, APPLICATION_FILTERS } from "../../admission/list";
import { openYears } from "../../admission/settings";
import { n, plural, someNames } from "../common";
import type { DashContext, Widget } from "../types";

const BASE = "/admission-management";
const NONE = "00000000-0000-0000-0000-000000000000";

function admissionView(c: DashContext): Promise<{ v: AdmissionViewer; yearIds: string[] }> {
  return c.memo("admission-view", async () => {
    // The person's campus limit too, as the Enquiries and Applications lists read it (gap list G36).
    const source = { permissions: c.viewer.permissions, roles: c.viewer.roles, user: c.viewer.user, campusId: c.viewer.campusId ?? null } as unknown as ViewerSource;
    const [v, years] = await Promise.all([viewerFor(c.tx, c.viewer.ctx, source), openYears(c.tx, c.viewer.campusId ?? null)]);
    return { v, yearIds: years.length ? years.map((y) => y.id) : [NONE] };
  });
}

/** The Enquiries list's own filter for these search params. */
async function enquiries(c: DashContext, filters: Record<string, string>) {
  const { v, yearIds } = await admissionView(c);
  return enquiryWhere(readListParams(filters, ENQUIRY_FILTERS), v, { yearId: yearIds, timeZone: c.tz, now: c.now });
}

const newEnquiries: Widget<"band"> = {
  id: "admissions.new-enquiries",
  module: "admission-management",
  kind: "band",
  homes: ["leader", "receptionist", "admission", "office"],
  async load(c) {
    const [week, today] = await Promise.all([enquiries(c, { quick: "new-week" }), enquiries(c, { quick: "today" })]);
    const [count, calls] = await Promise.all([c.tx.enquiry.count({ where: week }), c.tx.enquiry.count({ where: today })]);
    const own = (await admissionView(c)).v.see !== "all";
    return {
      id: "admissions.new-enquiries", label: own ? "My new enquiries" : "New enquiries", big: n(count),
      foot: calls ? `This week · ${plural(calls, "follow-up")} today` : "In the last 7 days",
      href: `${BASE}/enquiries?quick=new-week`,
    };
  },
};

const followUps: Widget<"attention"> = {
  id: "admissions.follow-ups",
  module: "admission-management",
  kind: "attention",
  homes: ["leader", "receptionist", "admission", "office"],
  async load(c) {
    const [late, today] = await Promise.all([enquiries(c, { quick: "overdue" }), enquiries(c, { quick: "today" })]);
    const [lateRows, lateCount, todayCount] = await Promise.all([
      c.tx.enquiry.findMany({ where: late, orderBy: { nextFollowUpAt: "asc" }, take: 2, select: { parentName: true, childName: true } }),
      c.tx.enquiry.count({ where: late }),
      c.tx.enquiry.count({ where: today }),
    ]);
    const own = (await admissionView(c)).v.see !== "all";
    if (lateCount) {
      return {
        id: "admissions.follow-ups-late", tone: "warn", icon: "Clock",
        title: `${plural(lateCount, "enquiry follow-up")} ${own ? "of yours " : ""}past the time set`,
        detail: `${someNames(lateRows.map((r) => `${r.parentName} (${r.childName})`))}${lateCount > 2 ? ` and ${n(lateCount - 2)} more` : ""}${todayCount ? ` · ${n(todayCount)} due today` : ""}`,
        action: "Call", href: `${BASE}/enquiries?quick=overdue`, value: String(lateCount),
      };
    }
    if (!todayCount) return null;
    return {
      id: "admissions.follow-ups-today", tone: "info", icon: "Clock",
      title: `${plural(todayCount, "enquiry follow-up call")} due today`,
      detail: own ? "Enquiries you own or added" : "Every enquiry with a follow-up set for today",
      action: "Call", href: `${BASE}/enquiries?quick=today`, value: String(todayCount),
    };
  },
};

/** Applications waiting for a decision: the admission team only (full reach). */
const pendingApplications: Widget<"attention"> = {
  id: "admissions.pending-applications",
  module: "admission-management",
  kind: "attention",
  homes: ["leader", "admission", "office"],
  allowed: (v) => v.permissions["admission-management"].see === "all",
  async load(c) {
    const { v, yearIds } = await admissionView(c);
    const where = applicationWhere(readListParams({ stage: "DECISION" }, APPLICATION_FILTERS), { yearId: yearIds, timeZone: c.tz, campusId: v.campusId });
    const [count, rows] = await Promise.all([
      c.tx.application.count({ where }),
      c.tx.application.findMany({ where, orderBy: { createdAt: "asc" }, take: 2, select: { fullName: true } }),
    ]);
    if (!count) return null;
    return {
      id: "admissions.pending-applications", tone: "info", icon: "ClipboardCheck",
      title: `${plural(count, "application")} waiting for a decision`,
      detail: `${someNames(rows.map((r) => r.fullName))}${count > 2 ? ` and ${n(count - 2)} more` : ""}`,
      action: "Decide", href: `${BASE}/applications?stage=DECISION`, value: String(count),
    };
  },
};

export const ADMISSION_WIDGETS: Widget[] = [newEnquiries, followUps, pendingApplications] as Widget[];
