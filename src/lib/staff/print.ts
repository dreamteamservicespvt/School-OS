// Printed staff documents (P9), in the school's own designs from Settings,
// Document Designs (09 §2 Documents & ID Cards, 20 §2): staff ID cards with
// the shared ID card designer ("staff-id-card"), the experience letter
// ("experience-letter") and the offer letter ("offer-letter"), each filled
// from the staff record through the same merge fields the designer shows.
// Every value is escaped and photos are embedded (src/lib/documents).
import "server-only";

import type { Staff } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { formatDate, formatRupees } from "../format";
import { renderDocument, type DocumentData } from "../documents";
import { currentDesign } from "../documents/designs";

export const STAFF_ID_CARD_DOC = "staff-id-card";
export const EXPERIENCE_LETTER_DOC = "experience-letter";
export const OFFER_LETTER_DOC = "offer-letter";

type CardStaff = Pick<Staff, "fullName" | "staffCode" | "designation" | "bloodGroup" | "phone" | "photoFileId" | "joiningDate" | "campusId" | "gender"> & { department?: { name: string } | null };

/** The staff record's merge fields (the Staff fields of src/lib/documents/types.ts). */
function staffFields(s: CardStaff & { leavingDate?: Date | null }, tz: string): DocumentData["fields"] {
  return {
    staff_name: s.fullName,
    staff_code: s.staffCode,
    designation: s.designation,
    department: s.department?.name ?? "",
    joining_date: formatDate(s.joiningDate, tz),
    leaving_date: s.leavingDate ? formatDate(s.leavingDate, tz) : "",
    blood_group: s.bloodGroup ?? "",
    staff_phone: s.phone,
    gender: s.gender ?? "",
  };
}

/**
 * Letters keep the signature they always had when the school has not chosen
 * signatories for the design yet: the Principal's, if one is set up in
 * Settings, Document Designs.
 */
async function letterDesign(tx: Tx, ctx: SchoolContext, docType: string) {
  const design = await currentDesign(tx, docType);
  if (design.options.signatoryIds.length) return undefined;
  const principal = await tx.signatory.findFirst({ where: { schoolId: ctx.schoolId, title: "Principal", archivedAt: null } });
  return principal ? { base: design.base, options: { ...design.options, signatoryIds: [principal.id] } } : undefined;
}

/** Staff ID cards on A4 sheets, in the school's Staff ID card design. */
export async function staffIdCards(tx: Tx, ctx: SchoolContext, staff: CardStaff[], timeZone: string) {
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { code: true } });
  const records: DocumentData[] = staff.map((s) => ({
    fields: staffFields(s, timeZone),
    photoFileId: s.photoFileId,
    campusId: s.campusId,
    verifyText: `${school.code}:${s.staffCode}`,
  }));
  return renderDocument(tx, ctx, STAFF_ID_CARD_DOC, records);
}

/** The experience letter in the school's design; the number and the date it was first issued stay the same on a reprint. */
export async function experienceLetter(tx: Tx, ctx: SchoolContext, input: { staff: CardStaff; number: string; lastDay: Date; issuedOn: Date; timeZone: string }) {
  const fields = { ...staffFields({ ...input.staff, leavingDate: input.lastDay }, input.timeZone), letter_no: input.number, today: formatDate(input.issuedOn, input.timeZone) };
  const design = await letterDesign(tx, ctx, EXPERIENCE_LETTER_DOC);
  return renderDocument(tx, ctx, EXPERIENCE_LETTER_DOC, { fields, campusId: input.staff.campusId }, design ? { design } : {});
}

/** The offer letter in the school's design, from the offer (the person is not on the staff yet). */
export async function offerLetter(tx: Tx, ctx: SchoolContext, input: { name: string; offerNo: string; designation: string; department: string | null; joiningDate: Date; monthlyPaise: bigint | null; respondBy: Date | null; issuedOn: Date; timeZone: string }) {
  const fields = {
    staff_name: input.name,
    designation: input.designation,
    department: input.department ?? "",
    joining_date: formatDate(input.joiningDate, input.timeZone),
    monthly_salary: input.monthlyPaise !== null ? formatRupees(input.monthlyPaise) : "the amount in your appointment letter",
    reporting_to: "the Principal",
    accept_by: input.respondBy ? formatDate(input.respondBy, input.timeZone) : "the date given by the school office",
    letter_no: input.offerNo,
    today: formatDate(input.issuedOn, input.timeZone),
  };
  const design = await letterDesign(tx, ctx, OFFER_LETTER_DOC);
  return renderDocument(tx, ctx, OFFER_LETTER_DOC, { fields }, design ? { design } : {});
}
