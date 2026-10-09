// Printed staff documents (P9): staff ID cards from the shared ID card
// design (Settings, Document Designs), the experience letter and the offer
// letter. Every merge field is escaped; photos are embedded, never fetched.
import "server-only";

import type { Staff } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { esc } from "../pdf";
import { fileStore } from "../storage";
import { formatDate, formatRupees } from "../format";

export type Design = {
  title: string;
  color: string;
  showBloodGroup: boolean;
  showPhone: boolean;
  footer: string;
  signatoryTitle: string;
};

const DEFAULT_ID_CARD: Design = { title: "Staff Identity Card", color: "#1d4ed8", showBloodGroup: true, showPhone: true, footer: "If found, please return to the school office.", signatoryTitle: "Principal" };

/** The school's current ID card design for staff, from Settings, Document Designs, with safe defaults. */
export async function idCardDesign(tx: Tx, ctx: SchoolContext): Promise<Design> {
  const d = await tx.documentDesign.findFirst({ where: { schoolId: ctx.schoolId, docType: { in: ["staff-id-card", "id-card"] }, isCurrent: true }, orderBy: { version: "desc" } });
  const o = (d?.options ?? {}) as Partial<Design> & { colour?: string };
  const color = typeof (o.color ?? o.colour) === "string" && /^#[0-9a-f]{6}$/i.test(o.color ?? o.colour ?? "") ? (o.color ?? o.colour)! : DEFAULT_ID_CARD.color;
  return {
    title: typeof o.title === "string" && o.title ? o.title : DEFAULT_ID_CARD.title,
    color,
    showBloodGroup: o.showBloodGroup ?? true,
    showPhone: o.showPhone ?? true,
    footer: typeof o.footer === "string" ? o.footer : DEFAULT_ID_CARD.footer,
    signatoryTitle: typeof o.signatoryTitle === "string" && o.signatoryTitle ? o.signatoryTitle : "Principal",
  };
}

async function dataUri(tx: Tx, fileId: string | null): Promise<string | null> {
  if (!fileId) return null;
  const f = await tx.storedFile.findFirst({ where: { id: fileId, archivedAt: null } });
  if (!f || !f.contentType.startsWith("image/")) return null;
  const body = await fileStore().get(f.storageKey);
  return body ? `data:${f.contentType};base64,${body.toString("base64")}` : null;
}

async function schoolHead(tx: Tx, ctx: SchoolContext) {
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId } });
  const logo = (await dataUri(tx, school.logoFileId)) ?? null;
  return { school, logo };
}

const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

type CardStaff = Pick<Staff, "fullName" | "staffCode" | "designation" | "bloodGroup" | "phone" | "photoFileId" | "emergencyPhone"> & { department?: { name: string } | null };

/** A4 pages of CR80 cards (85.6 mm × 54 mm), 10 to a page. */
export async function idCardsHtml(tx: Tx, ctx: SchoolContext, staff: CardStaff[], timeZone: string) {
  const design = await idCardDesign(tx, ctx);
  const { school, logo } = await schoolHead(tx, ctx);
  const signer = await tx.signatory.findFirst({ where: { schoolId: ctx.schoolId, title: design.signatoryTitle, archivedAt: null } });
  const sign = signer ? await dataUri(tx, signer.imageFileId) : null;
  const cards: string[] = [];
  for (const s of staff) {
    const photo = await dataUri(tx, s.photoFileId);
    cards.push(`<div class="card">
      <div class="top" style="background:${esc(design.color)}">
        ${logo ? `<img class="logo" src="${logo}" alt="">` : ""}
        <div><div class="school">${esc(school.name)}</div><div class="title">${esc(design.title)}</div></div>
      </div>
      <div class="body">
        ${photo ? `<img class="photo" src="${photo}" alt="">` : `<div class="photo ph">${esc(initials(s.fullName))}</div>`}
        <div class="info">
          <div class="name">${esc(s.fullName)}</div>
          <div class="desig">${esc(s.designation)}${s.department ? ` · ${esc(s.department.name)}` : ""}</div>
          <table>
            <tr><td>Staff ID</td><td><b>${esc(s.staffCode)}</b></td></tr>
            ${design.showBloodGroup && s.bloodGroup ? `<tr><td>Blood group</td><td>${esc(s.bloodGroup)}</td></tr>` : ""}
            ${design.showPhone ? `<tr><td>Phone</td><td>${esc(s.phone)}</td></tr>` : ""}
            ${s.emergencyPhone ? `<tr><td>Emergency</td><td>${esc(s.emergencyPhone)}</td></tr>` : ""}
          </table>
        </div>
      </div>
      <div class="foot"><span>${esc(design.footer)}</span><span class="sign">${sign ? `<img src="${sign}" alt="">` : ""}${esc(design.signatoryTitle)}</span></div>
    </div>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 10mm; }
    body { margin: 0; font-family: Arial, "Noto Sans", sans-serif; color: #111; }
    .sheet { display: grid; grid-template-columns: 85.6mm 85.6mm; gap: 6mm 8mm; justify-content: center; }
    .card { width: 85.6mm; height: 54mm; border: 0.3mm solid #999; border-radius: 3mm; overflow: hidden; display: flex; flex-direction: column; break-inside: avoid; }
    .top { color: #fff; display: flex; align-items: center; gap: 2mm; padding: 1.6mm 2.5mm; }
    .logo { width: 8mm; height: 8mm; object-fit: contain; background: #fff; border-radius: 1mm; }
    .school { font-weight: bold; font-size: 9pt; line-height: 1.1; }
    .title { font-size: 6.5pt; text-transform: uppercase; letter-spacing: .3mm; opacity: .9; }
    .body { flex: 1; display: flex; gap: 2.5mm; padding: 2mm 2.5mm 0; }
    .photo { width: 20mm; height: 25mm; object-fit: cover; border-radius: 1.5mm; border: 0.3mm solid #ccc; }
    .ph { display: grid; place-items: center; background: #eef2ff; font-size: 14pt; font-weight: bold; color: #333; }
    .name { font-weight: bold; font-size: 10pt; }
    .desig { font-size: 7.5pt; color: #333; margin-bottom: 1mm; }
    table { font-size: 7pt; border-collapse: collapse; } td { padding: 0.2mm 1.5mm 0.2mm 0; vertical-align: top; } td:first-child { color: #555; }
    .foot { display: flex; justify-content: space-between; align-items: flex-end; font-size: 5.5pt; color: #555; padding: 0 2.5mm 1.5mm; gap: 2mm; }
    .sign { text-align: center; } .sign img { display: block; height: 5mm; margin: 0 auto; }
  </style></head><body><div class="sheet">${cards.join("")}</div>
  <p style="font-size:7pt;color:#777;text-align:center;margin-top:4mm">${esc(staff.length)} card${staff.length === 1 ? "" : "s"} · printed ${esc(formatDate(new Date(), timeZone))}</p></body></html>`;
}

function letterShell(inner: string, school: { name: string; address: string | null; phone: string | null; email: string | null; affiliationNumber: string | null }, logo: string | null) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm 20mm; }
    body { font-family: Georgia, "Noto Serif", serif; font-size: 11.5pt; line-height: 1.6; color: #111; }
    .head { display: flex; gap: 5mm; align-items: center; border-bottom: 0.6mm solid #333; padding-bottom: 3mm; margin-bottom: 8mm; }
    .head img { width: 18mm; height: 18mm; object-fit: contain; }
    .head h1 { margin: 0; font-size: 17pt; } .head p { margin: 0; font-size: 9pt; color: #444; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8mm; font-size: 10.5pt; }
    h2 { text-align: center; font-size: 13pt; letter-spacing: 0.4mm; text-decoration: underline; margin: 0 0 8mm; }
    .sign { margin-top: 22mm; } .sign img { height: 14mm; display: block; }
  </style></head><body>
  <div class="head">${logo ? `<img src="${logo}" alt="">` : ""}<div><h1>${esc(school.name)}</h1>
  <p>${esc(school.address ?? "")}${school.phone ? ` · ${esc(school.phone)}` : ""}${school.email ? ` · ${esc(school.email)}` : ""}${school.affiliationNumber ? ` · Affiliation No. ${esc(school.affiliationNumber)}` : ""}</p></div></div>
  ${inner}</body></html>`;
}

export async function experienceLetterHtml(tx: Tx, ctx: SchoolContext, input: { staff: Staff & { department?: { name: string } | null }; number: string; lastDay: Date; issuedOn: Date; timeZone: string }) {
  const { school, logo } = await schoolHead(tx, ctx);
  const signer = await tx.signatory.findFirst({ where: { schoolId: ctx.schoolId, title: "Principal", archivedAt: null } });
  const sign = signer ? await dataUri(tx, signer.imageFileId) : null;
  const s = input.staff;
  const pronoun = s.gender === "Female" ? ["She", "her"] : s.gender === "Male" ? ["He", "his"] : ["They", "their"];
  const title = s.gender === "Female" ? "Ms." : s.gender === "Male" ? "Mr." : "";
  return letterShell(`
    <div class="row"><span>No. ${esc(input.number)}</span><span>Date: ${esc(formatDate(input.issuedOn, input.timeZone))}</span></div>
    <h2>EXPERIENCE CERTIFICATE</h2>
    <p>This is to certify that <b>${esc(title)} ${esc(s.fullName)}</b> (Staff ID ${esc(s.staffCode)}) worked at ${esc(school.name)} as
    <b>${esc(s.designation)}</b>${s.department ? ` in the ${esc(s.department.name)} department` : ""} from <b>${esc(formatDate(s.joiningDate, input.timeZone))}</b>
    to <b>${esc(formatDate(input.lastDay, input.timeZone))}</b>.</p>
    <p>During this period ${esc(pronoun[1])} work and conduct were found to be good. ${esc(pronoun[0])} ${pronoun[0] === "They" ? "were" : "was"} sincere and dependable in ${esc(pronoun[1])} duties.</p>
    <p>We wish ${esc(s.fullName)} every success in the future.</p>
    <div class="sign">${sign ? `<img src="${sign}" alt="">` : ""}<b>${esc(signer?.name ?? "")}</b><br>Principal<br>${esc(school.name)}</div>`, school, logo);
}

export async function offerLetterHtml(tx: Tx, ctx: SchoolContext, input: { name: string; offerNo: string; designation: string; department: string | null; joiningDate: Date; monthlyPaise: bigint | null; respondBy: Date | null; issuedOn: Date; timeZone: string }) {
  const { school, logo } = await schoolHead(tx, ctx);
  const signer = await tx.signatory.findFirst({ where: { schoolId: ctx.schoolId, title: "Principal", archivedAt: null } });
  return letterShell(`
    <div class="row"><span>No. ${esc(input.offerNo)}</span><span>Date: ${esc(formatDate(input.issuedOn, input.timeZone))}</span></div>
    <p>Dear ${esc(input.name)},</p>
    <h2>LETTER OF OFFER</h2>
    <p>We are pleased to offer you the post of <b>${esc(input.designation)}</b>${input.department ? ` in the ${esc(input.department)} department` : ""} at ${esc(school.name)}.
    Your joining date will be <b>${esc(formatDate(input.joiningDate, input.timeZone))}</b>.</p>
    ${input.monthlyPaise !== null ? `<p>Your gross monthly salary will be <b>${esc(formatRupees(input.monthlyPaise))}</b>, with the details in your appointment letter.</p>` : ""}
    ${input.respondBy ? `<p>Please confirm your acceptance by <b>${esc(formatDate(input.respondBy, input.timeZone))}</b>.</p>` : ""}
    <p>We look forward to welcoming you.</p>
    <div class="sign"><b>${esc(signer?.name ?? "")}</b><br>Principal<br>${esc(school.name)}</div>`, school, logo);
}
