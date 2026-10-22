// Boarders carry over into a new academic year (15 §2 Allocation, inferred:
// "Hostel fees follow the same pattern as A12 for transport", so the review
// step is the one Transport uses, src/lib/transport/carry.ts). A hostel fee
// plan belongs to one school year, and so does the year a Bed Allocation's
// fees come from. When a new year becomes the active one, the wardens are
// told and review the boarders whose bed is still on last year: each boarder
// keeps their bed (the same allocation, so the bed history and check-in stay
// as they are) and the new year's hostel fee plan for their room goes on
// their fees, from the installment covering the new year's first day. A bed
// is carried once: after it, its year is the new year, so it is never listed
// or charged again; an installment already charged is never charged twice.
// Students who left the school, beds whose room has no plan in the new year
// (when they paid hostel fees) and boarders who pay hostel fees but have no
// class in the new year yet (the fees go with the class) cannot be carried
// over until sorted out; a boarder without hostel fees and without a class
// yet is shown but not ticked.
// Boarders not coming back are checked out on the last day of the old year,
// so nothing of the new year is charged.
import "server-only";

import type { AcademicYear, BedAllocation } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatDate, formatRupees } from "../format";
import { STUDYING } from "../students/labels";
import { addHostelFees, checkOut } from "./allocation";
import { HostelProblem } from "./problem";
import { feePlans, planForRoom, wardenLogins, type FeePlan } from "./settings";
import { BASE, bedWords } from "./words";
import type { Mine } from "./scope";

const DAY = 86_400_000;

export type HostelCarryRow = {
  allocation: BedAllocation;
  fromYear: Pick<AcademicYear, "id" | "name" | "endDate">;
  toYear: Pick<AcademicYear, "id" | "name" | "startDate">;
  name: string;
  hostelName: string;
  where: string;
  /** The new year's plan for the room (null: no hostel fees, as before, or none set yet). */
  plan: FeePlan | null;
  /** The class in the new year, when given. */
  newClass: string | null;
  /** Why it cannot be carried over (nothing = it can). */
  blocked: string | null;
  /** Shown with a boarder who can be carried over but is not ticked by itself. */
  note: string | null;
};

/**
 * Boarders whose bed is still on an earlier year than their campus's active
 * year, with what carrying each over would do. Only the person's hostels;
 * optionally only the given allocation ids.
 */
export async function carryOverRows(tx: Tx, mine: Mine, ids?: string[]): Promise<HostelCarryRow[]> {
  const active = await tx.academicYear.findMany({ where: { status: "ACTIVE", archivedAt: null } });
  if (!active.length) return [];
  const byCampus = new Map(active.map((y) => [y.campusId, y]));
  const years = new Map((await tx.academicYear.findMany({ where: { archivedAt: null } })).map((y) => [y.id, y]));
  const beds = await tx.bedAllocation.findMany({
    where: { status: "ACTIVE", ...(mine === null ? {} : { hostelId: { in: mine } }), ...(ids ? { id: { in: ids } } : {}) },
    orderBy: [{ hostelId: "asc" }, { startDate: "asc" }],
  });
  const students = new Map((await tx.student.findMany({ where: { id: { in: beds.map((b) => b.studentId) } }, select: { id: true, fullName: true, status: true, campusId: true, archivedAt: true } })).map((s) => [s.id, s]));
  const rows: { a: BedAllocation; from: AcademicYear; to: AcademicYear }[] = [];
  for (const a of beds) {
    const from = years.get(a.academicYearId);
    const s = students.get(a.studentId);
    const to = s ? byCampus.get(s.campusId) : undefined;
    if (!from || !to || from.id === to.id || from.startDate >= to.startDate) continue;
    rows.push({ a, from, to });
  }
  if (!rows.length) return [];
  const [rooms, bedRows, hostels, enrolments] = await Promise.all([
    tx.hostelRoom.findMany({ where: { id: { in: rows.map((r) => r.a.roomId) } }, select: { id: true, roomNo: true, roomType: true } }),
    tx.hostelBed.findMany({ where: { id: { in: rows.map((r) => r.a.bedId) } }, select: { id: true, bedNo: true } }),
    tx.hostel.findMany({ where: { id: { in: rows.map((r) => r.a.hostelId) } }, select: { id: true, name: true } }),
    tx.enrolment.findMany({ where: { studentId: { in: rows.map((r) => r.a.studentId) }, academicYearId: { in: [...new Set(rows.map((r) => r.to.id))] }, archivedAt: null, status: { not: "LEFT" } }, select: { studentId: true, academicYearId: true, sectionId: true } }),
  ]);
  const sections = await tx.section.findMany({ where: { id: { in: enrolments.map((e) => e.sectionId) } }, select: { id: true, name: true, schoolClass: { select: { name: true } } } });
  const plansOf = new Map<string, FeePlan[]>();
  for (const id of new Set(rows.map((r) => r.to.id))) plansOf.set(id, await feePlans(tx, id));
  return rows.map(({ a, from, to }) => {
    const s = students.get(a.studentId)!;
    const room = rooms.find((x) => x.id === a.roomId);
    const e = enrolments.find((x) => x.studentId === a.studentId && x.academicYearId === to.id);
    const sec = e ? sections.find((x) => x.id === e.sectionId) : null;
    const plan = a.feePlanId ? planForRoom(plansOf.get(to.id) ?? [], a.hostelId, room?.roomType ?? null) : null;
    let blocked: string | null = null;
    if (s.archivedAt || !(STUDYING as readonly string[]).includes(s.status)) blocked = "Not studying here now. Check out at year end.";
    else if (a.feePlanId && !plan) blocked = `No ${to.name} hostel fee plan for this room yet. The Accountant or Principal adds it in Hostel Settings, Hostel fees.`;
    // The new year's hostel fees go with the student's class that year (Fee Management), so a boarder who pays them is promoted first.
    else if (plan && !sec) blocked = `No class in ${to.name} yet. Promote ${s.fullName.split(" ")[0]} first; the ${to.name} hostel fees go with the class.`;
    return {
      allocation: a, fromYear: from, toYear: to, name: s.fullName, hostelName: hostels.find((h) => h.id === a.hostelId)?.name ?? "Hostel",
      where: bedWords(room?.roomNo ?? "?", bedRows.find((b) => b.id === a.bedId)?.bedNo ?? 0), plan,
      newClass: sec ? `${sec.schoolClass.name.replace(/^Class\s+/i, "")} ${sec.name}` : null,
      blocked, note: !blocked && !sec ? `No class in ${to.name} yet (not promoted).` : null,
    };
  });
}

export type HostelCarryResult = { carried: number; feeRows: number; feePaise: bigint; year: string; skipped: { name: string; why: string }[] };

/**
 * Carries the chosen boarders over: each keeps their bed, the bed's year
 * becomes the new year, and the new year's plan for the room goes on their
 * fees from the installment covering the new year's first day (or the bed's
 * first night, if later).
 */
export async function carryOver(tx: Tx, ctx: SchoolContext, allocationIds: string[], mine: Mine): Promise<HostelCarryResult> {
  const ids = [...new Set(allocationIds)];
  if (!ids.length) throw new HostelProblem("Tick the boarders to carry over.", "allocationIds");
  if (ids.length > 2000) throw new HostelProblem("Carry over at most 2,000 boarders at a time.", "allocationIds");
  const rows = await carryOverRows(tx, mine, ids);
  if (!rows.length) throw new HostelProblem("These boarders were carried over or checked out already. Refresh the page.");
  const out: HostelCarryResult = { carried: 0, feeRows: 0, feePaise: BigInt(0), year: rows[0].toYear.name, skipped: [] };
  for (const r of rows) {
    if (r.blocked) { out.skipped.push({ name: r.name, why: r.blocked }); continue; }
    // Claim the bed for the new year first, so two people pressing at once carry it once.
    const claimed = await tx.bedAllocation.updateMany({ where: { id: r.allocation.id, status: "ACTIVE", academicYearId: r.fromYear.id }, data: { academicYearId: r.toYear.id, feePlanId: r.plan?.id ?? null } });
    if (!claimed.count) continue;
    const from = r.allocation.startDate > r.toYear.startDate ? r.allocation.startDate : r.toYear.startDate;
    const fresh = await tx.bedAllocation.findUniqueOrThrow({ where: { id: r.allocation.id } });
    const fees = r.plan ? await addHostelFees(tx, ctx, fresh, r.plan, from) : { total: BigInt(0), rows: 0 };
    await writeAudit(tx, ctx, {
      action: "carried-over", recordType: "Bed Allocation", recordId: r.allocation.id,
      before: { year: r.fromYear.name, feePlan: r.allocation.feePlanId },
      after: { student: r.name, bed: r.where, hostel: r.hostelName, year: r.toYear.name, feePlan: r.plan?.name ?? "No hostel fees", fees: formatRupees(fees.total), from: formatDate(from, "UTC") },
    });
    out.carried++;
    out.feeRows += fees.rows;
    out.feePaise += fees.total;
  }
  if (!out.carried) throw new HostelProblem(out.skipped.length === 1 ? `${out.skipped[0].name}: ${out.skipped[0].why}` : "None of the ticked boarders can be carried over yet. See the reason on each.");
  return out;
}

/**
 * Checks the chosen boarders out on the last day of their old year (not
 * staying in the hostel in the new year): the bed becomes free and nothing
 * of the new year is charged. Fees already paid stay as they are.
 */
export async function checkOutAtYearEnd(tx: Tx, ctx: SchoolContext, allocationIds: string[], mine: Mine, now: Date) {
  const ids = [...new Set(allocationIds)];
  if (!ids.length) throw new HostelProblem("Tick the boarders to check out.", "allocationIds");
  const rows = await carryOverRows(tx, mine, ids);
  if (!rows.length) throw new HostelProblem("These boarders were carried over or checked out already. Refresh the page.");
  let done = 0;
  const skipped: { name: string; why: string }[] = [];
  for (const r of rows) {
    const last = r.fromYear.endDate < r.toYear.startDate ? r.fromYear.endDate : new Date(r.toYear.startDate.getTime() - DAY);
    const date = last < r.allocation.startDate ? r.allocation.startDate : last;
    try {
      await checkOut(tx, ctx, { allocationId: r.allocation.id, date, reason: `Not staying in the hostel in ${r.toYear.name}` }, { now, assertHostel: () => {} });
      done++;
    } catch (e) {
      if (!(e instanceof HostelProblem)) throw e;
      skipped.push({ name: r.name, why: e.message });
    }
  }
  if (!done) throw new HostelProblem(skipped.length === 1 ? `${skipped[0].name}: ${skipped[0].why}` : "None of the ticked boarders could be checked out. See the reason on each.");
  return { done, year: rows[0].toYear.name, skipped };
}

/**
 * Academic Management opened a new year: the wardens of each hostel are told
 * how many of their boarders wait to be carried over. Returns the count.
 */
export async function noticeNewYear(tx: Tx, ctx: SchoolContext, year: Pick<AcademicYear, "name">) {
  const rows = await carryOverRows(tx, null);
  const byHostel = new Map<string, number>();
  for (const r of rows) byHostel.set(r.allocation.hostelId, (byHostel.get(r.allocation.hostelId) ?? 0) + 1);
  for (const [hostelId, n] of byHostel) {
    for (const to of await wardenLogins(tx, hostelId)) {
      await notify(tx, ctx, { to, type: "hostel", text: `${year.name} is open: ${n} boarder${n === 1 ? "" : "s"} to carry over into the new year. Review them in Allocation.`, link: `${BASE}/allocation?carry=1`, groupKey: `hostel-carry-${year.name}-${hostelId}` });
    }
  }
  return rows.length;
}

