// The lists the Admission forms choose from: classes, sources, owners and the
// school's extra fields. Read once per page on the server.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import type { Current } from "../current";
import { loadCustomFields, visibleFields } from "../custom-fields";
import { instantToLocal } from "./act";
import { defaultFollowUp } from "./enquiries";
import { admissionStaff, admissionYear, CATEGORIES, classList, live, needsPreviousSchool, openYears, type Settings } from "./settings";
import { seatsFor } from "./seats";

export async function names(tx: Tx) {
  const [classes, staff] = await Promise.all([
    tx.schoolClass.findMany({ select: { id: true, name: true } }),
    tx.staff.findMany({ select: { id: true, fullName: true } }),
  ]);
  return { classes: new Map(classes.map((c) => [c.id, c.name])), staff: new Map(staff.map((s) => [s.id, s.fullName])) };
}

/** Classes with seats left, years, categories and extra fields for the application form. */
export async function applicationChoices(tx: Tx, current: Pick<Current, "roles">, s: Settings, yearId: string | null) {
  const [classes, years, fields, seats] = await Promise.all([classList(tx), openYears(tx), loadCustomFields(tx, "application"), yearId ? seatsFor(tx, yearId) : Promise.resolve(new Map())]);
  return {
    classes: classes.map((c) => {
      const seat = seats.get(c.id);
      return {
        value: c.id, label: c.name, previousSchool: needsPreviousSchool(c, classes),
        seatsText: !seat ? "no sections yet" : seat.free > 0 ? `${seat.free} of ${seat.seats} seats left` : "full",
        full: Boolean(seat && seat.free <= 0),
      };
    }),
    years: years.map((y) => ({ value: y.id, label: y.name })),
    categories: s.quotaOn ? (s.quotaList.length ? s.quotaList.map((q) => q.category) : [...CATEGORIES]) : [],
    customFields: visibleFields(fields, current.roles),
  };
}

export async function enquiryChoices(tx: Tx, ctx: SchoolContext, current: Pick<Current, "roles">, s: Settings, tz: string) {
  const [classes, staff, fields, follow, years, rules, year] = await Promise.all([
    classList(tx), admissionStaff(tx, ctx), loadCustomFields(tx, "enquiry"), defaultFollowUp(tx, ctx, tz), openYears(tx), tx.admissionClassRule.findMany({ select: { classId: true, ownerStaffId: true } }), admissionYear(tx, ctx, s),
  ]);
  const sources = live(s.sourceList);
  const active = years.find((y) => y.status === "ACTIVE");
  const ownerName = (id: string | null | undefined) => staff.find((x) => x.id === id)?.fullName ?? null;
  const turnNext = s.ownerRule === "turn" && s.turnStaffIds.length ? ownerName(s.turnStaffIds[s.turnNext % s.turnStaffIds.length]) : null;
  return {
    classes: classes.map((c) => ({ value: c.id, label: c.name })),
    sources: sources.map((x) => ({ value: x.key, label: x.label })),
    owners: staff.map((x) => ({ value: x.id, label: `${x.fullName} (${x.designation})` })),
    defaultSource: sources.some((x) => x.key === "walk-in") ? "walk-in" : sources[0]?.key ?? "",
    defaultFollowUp: instantToLocal(follow, tz),
    customFields: visibleFields(fields, current.roles),
    years: years.map((y) => ({ value: y.id, label: active && year && y.id === active.id && y.id !== year.id ? `${y.name} (mid-year)` : y.name })),
    defaultYearId: year?.id ?? "",
    ownerRule: s.ownerRule,
    ownerByClass: s.ownerRule === "class" ? Object.fromEntries(rules.filter((r) => r.ownerStaffId && staff.some((x) => x.id === r.ownerStaffId)).map((r) => [r.classId, r.ownerStaffId!])) : {},
    defaultOwner: s.defaultOwnerStaffId && staff.some((x) => x.id === s.defaultOwnerStaffId) ? s.defaultOwnerStaffId : "",
    turnNext,
  };
}
