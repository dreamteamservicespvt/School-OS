// renderDocument(): how every module prints a document with the school's
// chosen design (Settings, Document Designs). For example, Fee Management:
//
//   const doc = await renderDocument(tx, ctx, "fee-receipt", {
//     fields: { receipt_no: "SPS/2026/00123", receipt_date: new Date(), student_name: "Aarav Sharma", ... },
//     lines: [{ label: "Tuition fee", amountPaise: 1850000n }],
//     campusId: student.campusId,
//   });
//   const pdf = await doc.pdf();
//
// Pass an array of records to print many at once (ID cards fill a sheet).
// The school's branding, the campus, the academic year, the logo, the
// signatories and their signatures are added here.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { fileStore } from "../storage";
import { htmlToPdf } from "../pdf";
import { currentYear } from "../academic/years";
import { currentDesign, type BaseKey, type DesignOptions } from "./designs";
import { pageSize, renderHtml, type Assets, type Branding, type DocumentData, type SignatoryView } from "./render";
import { findDocType } from "./types";

export type { DocumentData } from "./render";
export { DOC_TYPES, findDocType } from "./types";

/** An uploaded picture as a data: URI, for documents and small thumbnails. */
export async function dataUri(tx: Tx, fileId: string | null | undefined): Promise<string | null> {
  if (!fileId) return null;
  const file = await tx.storedFile.findUnique({ where: { id: fileId } });
  if (!file || file.archivedAt || !file.contentType.startsWith("image/")) return null;
  const body = await fileStore().get(file.storageKey);
  return body ? `data:${file.contentType};base64,${body.toString("base64")}` : null;
}

export type RenderOptions = {
  /** Use this design instead of the saved one (the editor's live preview). */
  design?: { base: BaseKey; options: DesignOptions };
};

export async function renderDocument(tx: Tx, ctx: SchoolContext, kind: string, data: DocumentData | DocumentData[], opts: RenderOptions = {}) {
  const type = findDocType(kind);
  if (!type) throw new Error(`Unknown document type ${kind}`);
  const records = Array.isArray(data) ? data : [data];
  const design = opts.design ?? (await currentDesign(tx, kind));

  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId } });
  const campusId = records[0]?.campusId ?? null;
  const campus = campusId ? await tx.campus.findUnique({ where: { id: campusId } }) : await tx.campus.findFirst({ where: { isMain: true, archivedAt: null } });
  const year = await currentYear(tx, ctx, campus?.id ?? null);
  const branding: Branding = {
    name: school.name,
    address: school.address,
    phone: school.phone,
    email: school.email,
    website: school.website,
    affiliationNumber: school.affiliationNumber,
    board: school.board,
    code: school.code,
    gstin: school.gstin,
    brandColor: school.brandColor && /^#[0-9a-fA-F]{6}$/.test(school.brandColor) ? school.brandColor : null,
    // A second campus shows its own name and address; the main campus uses the school's.
    campusName: campus && !campus.isMain ? campus.name : null,
    campusAddress: campus && !campus.isMain ? campus.address : null,
    academicYear: year?.name ?? null,
    timeZone: school.timeZone,
  };

  const signatoryRows = design.options.signatoryIds.length
    ? await tx.signatory.findMany({ where: { id: { in: design.options.signatoryIds }, archivedAt: null } })
    : [];
  const signatories: SignatoryView[] = [];
  for (const id of design.options.signatoryIds) {
    const s = signatoryRows.find((r) => r.id === id);
    if (s) signatories.push({ name: s.name, title: s.title, image: await dataUri(tx, s.imageFileId) });
  }

  const images = new Map<string, string>();
  for (const r of records) {
    if (r.photoFileId && !images.has(r.photoFileId)) {
      const uri = await dataUri(tx, r.photoFileId);
      if (uri) images.set(r.photoFileId, uri);
    }
  }
  const assets: Assets = {
    logo: (await dataUri(tx, school.logoFileId)) ?? (school.logoUrl?.startsWith("data:image/") ? school.logoUrl : null),
    background: await dataUri(tx, design.options.card.backgroundFileId),
    images,
  };

  const input = { type, base: design.base, options: design.options, branding, signatories, assets, records };
  const html = renderHtml(input);
  const size = pageSize(input);
  return {
    html,
    fileName: `${type.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`,
    pdf: () => htmlToPdf(html, { format: size.format, margin: size.margin }),
  };
}
