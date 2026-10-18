// The lists the Admission forms choose from: classes, sources, owners and the
// school's extra fields. Read once per page on the server. A person limited
// to one campus is offered only that campus's classes, years and staff; a
// person who sees several campuses sees the campus next to each class and year.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import type { Current } from "../current";
import { personCampusId } from "../campus";
import { loadCustomFields, visibleFields } from "../custom-fields";
import { instantToLocal } from "./act";
import { defaultFollowUp } from "./enquiries";
import { admissionStaff, admissionYear, admissionYears, campusNames, CATEGORIES, classList, live, needsPreviousSchool, openYears, withCampus, type Settings } from "./settings";
import { seatsFor } from "./seats";

export async function names(tx: Tx) {
  const [classes, staff] = await Promise.all([
    tx.schoolClass.findMany({ select: { id: true, name: true } }),
    tx.staff.findMany({ select: { id: true, fullName: true } }),
  ]);
  return { classes: new Map(classes.map((c) => [c.id, c.name])), staff: new Map(staff.map((s) => [s.id, s.fullName])) };
}

type Who = Pick<Current, "roles"> & { campusId?: string | null };

/**
 * Classes with seats left, years, categories and extra fields for the
 * application form. Seats are read in the year (or years, one per campus) given.
 */
export async function applicationChoices(tx: Tx, current: Who, s: Settings, yearId: string | string[] | null) {
  const limit = current.campusId ?? null;
  const yearIds = Array.isArray(yearId) ? yearId : yearId ? [yearId] : [];
  const [classes, years, fields, seatMaps, campus] = await Promise.all([
    classList(tx, limit), openYears(tx, limit), loadCustomFields(tx, "application"), Promise.all(yearIds.map((y) => seatsFor(tx, y))), campusNames(tx, limit),
  ]);
  const seats = new Map(seatMaps.flatMap((m) => [...m]));
  return {
    classes: classes.map((c) => {
      const seat = seats.get(c.id);
      return {
        value: c.id, label: withCampus(campus, c.name, c.campusId), previousSchool: needsPreviousSchool(c, classes.filter((x) => x.campusId === c.campusId)),
        seatsText: !seat ? "no sections yet" : seat.free > 0 ? `${seat.free} of ${seat.seats} seats left` : "full",
        full: Boolean(seat && seat.free <= 0),
      };
    }),
    years: years.map((y) => ({ value: y.id, label: withCampus(campus, y.name, y.campusId) })),
    categories: s.quotaOn ? (s.quotaList.length ? s.quotaList.map((q) => q.category) : [...CATEGORIES]) : [],
    customFields: visibleFields(fields, current.roles),
  };
}

export async function enquiryChoices(tx: Tx, ctx: SchoolContext, current: Who, s: Settings, tz: string) {
  const limit = current.campusId ?? null;
  const [classes, staff, fields, follow, years, rules, admitting, own, campus] = await Promise.all([
    classList(tx, limit), admissionStaff(tx, ctx, { campusId: limit }), loadCustomFields(tx, "enquiry"), defaultFollowUp(tx, tz), openYears(tx, limit),
    tx.admissionClassRule.findMany({ select: { classId: true, ownerStaffId: true } }), admissionYears(tx, ctx, s, limit), personCampusId(tx, ctx, current), campusNames(tx, limit),
  ]);
  const year = await admissionYear(tx, ctx, s, own);
  const sources = live(s.sourceList);
  // A campus's current year runs "mid-year" while admissions are open for its next year.
  const midYear = (y: (typeof years)[number]) => y.status === "ACTIVE" && admitting.some((a) => a.campusId === y.campusId && a.id !== y.id);
  const ownerName = (id: string | null | undefined) => staff.find((x) => x.id === id)?.fullName ?? null;
  const turnNext = s.ownerRule === "turn" && s.turnStaffIds.length ? ownerName(s.turnStaffIds[s.turnNext % s.turnStaffIds.length]) : null;
  return {
    classes: classes.map((c) => ({ value: c.id, label: withCampus(campus, c.name, c.campusId) })),
    sources: sources.map((x) => ({ value: x.key, label: x.label })),
    owners: staff.map((x) => ({ value: x.id, label: `${x.fullName} (${x.designation})` })),
    defaultSource: sources.some((x) => x.key === "walk-in") ? "walk-in" : sources[0]?.key ?? "",
    defaultFollowUp: instantToLocal(follow, tz),
    customFields: visibleFields(fields, current.roles),
    years: years.map((y) => ({ value: y.id, label: withCampus(campus, midYear(y) ? `${y.name} (mid-year)` : y.name, y.campusId) })),
    defaultYearId: year?.id ?? "",
    ownerRule: s.ownerRule,
    ownerByClass: s.ownerRule === "class" ? Object.fromEntries(rules.filter((r) => r.ownerStaffId && staff.some((x) => x.id === r.ownerStaffId)).map((r) => [r.classId, r.ownerStaffId!])) : {},
    defaultOwner: s.defaultOwnerStaffId && staff.some((x) => x.id === s.defaultOwnerStaffId) ? s.defaultOwnerStaffId : "",
    turnNext,
  };
}
