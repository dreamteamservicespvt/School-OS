// Postal & Deliveries (16 §2, optional): letters, couriers and parcels
// received and sent. The person an item is for is told on the app, and a
// hand-over records who collected it.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatNumber, nextNumber } from "../sequences";
import { saveFile, IMAGE_TYPES } from "../files";
import { FrontOfficeProblem } from "./problem";
import { todayIso } from "./time";

export type PostalInput = {
  direction: "RECEIVED" | "SENT";
  itemType: string;
  party: string;
  /** A staff member's id, or a department name. */
  forStaffId: string | null;
  forDepartment: string | null;
  courier: string | null;
  trackingNo: string | null;
  photo: File | null;
  tell: boolean;
};

/** "Accounts · Suresh Babu", "Lakshmi Rao (Principal)" or a department. */
export function forLabel(staff: { fullName: string; designation: string } | null, department: string | null) {
  if (staff) return /principal/i.test(staff.designation) ? `${staff.fullName} (${staff.designation})` : `${staff.fullName} · ${staff.designation}`;
  return department ?? "";
}

export async function recordPostal(tx: Tx, ctx: SchoolContext, input: PostalInput, opts: { timeZone: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const rec = input.direction === "RECEIVED";
  if (!["RECEIVED", "SENT"].includes(input.direction)) throw new FrontOfficeProblem("Choose received or sent.");
  if (!["LETTER", "COURIER", "PARCEL"].includes(input.itemType)) throw new FrontOfficeProblem("Choose the type.", "itemType");
  const party = input.party.trim().replace(/\s+/g, " ");
  if (party.length < 2) throw new FrontOfficeProblem(rec ? "Who is it from?" : "Who is it going to?", "party");
  if (party.length > 150) throw new FrontOfficeProblem("Keep it to 150 characters.", "party");
  let staff: { fullName: string; designation: string; userLoginId: string | null } | null = null;
  if (input.forStaffId) {
    staff = await tx.staff.findFirst({ where: { id: input.forStaffId, archivedAt: null }, select: { fullName: true, designation: true, userLoginId: true } });
    if (!staff) throw new FrontOfficeProblem("Choose the staff member from the list.", "for");
  }
  const dept = input.forDepartment?.trim() || null;
  if (!staff && !dept) throw new FrontOfficeProblem(rec ? "Choose the staff member or department." : "Choose who is sending it.", "for");
  const courier = input.courier?.trim().slice(0, 60) || null;
  const trackingNo = input.trackingNo?.trim().toUpperCase().replace(/\s+/g, " ").slice(0, 40) || null;
  if (!rec && !courier) throw new FrontOfficeProblem("Choose the courier, so it can be tracked.", "courier");
  const photo = rec && input.photo ? await saveFile(tx, ctx, { file: input.photo, purpose: "postal-photo", allowed: IMAGE_TYPES, maxImageWidth: 1000 }) : null;
  const year = todayIso(opts.timeZone, now).slice(0, 4);
  const entryNo = formatNumber(`PD-${year}-`, await nextNumber(tx, ctx, `postal-${year}`), 4);
  const forText = forLabel(staff, dept);
  const e = await tx.postalEntry.create({
    data: {
      schoolId: ctx.schoolId, entryNo, at: now, direction: input.direction, itemType: input.itemType, party, forStaffId: input.forStaffId, forText,
      courier: courier ?? (rec ? "Hand delivery" : null), trackingNo, photoFileId: photo?.id ?? null, status: rec ? "AT_DESK" : "SENT", createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Postal Entry", recordId: e.id, after: { entryNo, direction: e.direction, itemType: e.itemType, party, for: forText, courier: e.courier, trackingNo } });
  let told = false;
  if (rec && input.tell && staff?.userLoginId) {
    const n = await notify(tx, ctx, { to: staff.userLoginId, type: "delivery", text: `A ${input.itemType.toLowerCase()} from ${party} is at the front desk for you. Collect it from the desk.`, link: "/notifications", groupKey: "delivery", mergedText: (c) => `${c} items are at the front desk for you` }, now);
    told = Boolean(n);
  }
  return { entry: e, told };
}

/** Marks a received item handed over, with who collected it. */
export async function handOver(tx: Tx, ctx: SchoolContext, id: string, who: string, now = new Date()) {
  const e = await tx.postalEntry.findFirst({ where: { id, archivedAt: null } });
  if (!e) throw new FrontOfficeProblem("This entry was not found.");
  if (e.status !== "AT_DESK") throw new FrontOfficeProblem(`${e.entryNo} is not at the desk any more.`);
  const name = who.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new FrontOfficeProblem("Who collected it?", "who");
  if (name.length > 120) throw new FrontOfficeProblem("Keep it to 120 characters.", "who");
  await tx.postalEntry.update({ where: { id }, data: { status: "HANDED_OVER", handedToName: name, handedAt: now, handedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "handed-over", recordType: "Postal Entry", recordId: id, before: { status: "AT_DESK" }, after: { status: "HANDED_OVER", to: name } });
  return e;
}

export async function undoHandOver(tx: Tx, ctx: SchoolContext, id: string) {
  const e = await tx.postalEntry.findFirst({ where: { id, archivedAt: null } });
  if (!e || e.status !== "HANDED_OVER") throw new FrontOfficeProblem("This item is not handed over.");
  await tx.postalEntry.update({ where: { id }, data: { status: "AT_DESK", handedToName: null, handedAt: null, handedById: null } });
  await writeAudit(tx, ctx, { action: "hand-over-undone", recordType: "Postal Entry", recordId: id, before: { status: "HANDED_OVER", to: e.handedToName }, after: { status: "AT_DESK" } });
}

/** The postal register's filter, shared with its export. */
export const POSTAL_STATUS_KEYS = ["AT_DESK", "HANDED_OVER", "SENT"];

export function postalWhere(opts: { from: Date; to: Date; status: string; q: string; atDeskAlways: boolean }): Prisma.PostalEntryWhereInput {
  const q = opts.q.trim().slice(0, 60);
  const day: Prisma.PostalEntryWhereInput = opts.atDeskAlways ? { OR: [{ at: { gte: opts.from, lt: opts.to } }, { status: "AT_DESK" }] } : { at: { gte: opts.from, lt: opts.to } };
  return {
    AND: [{ archivedAt: null }, day, POSTAL_STATUS_KEYS.includes(opts.status) ? { status: opts.status } : {},
      q ? { OR: [{ party: { contains: q, mode: "insensitive" } }, { forText: { contains: q, mode: "insensitive" } }, { trackingNo: { contains: q.replace(/\s+/g, ""), mode: "insensitive" } }, { entryNo: { contains: q, mode: "insensitive" } }, { courier: { contains: q, mode: "insensitive" } }, { handedToName: { contains: q, mode: "insensitive" } }] } : {}],
  };
}
