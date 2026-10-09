// Certificates (03 §2 "Certificates & ID Cards", workflow 12). TC only after
// clearance (A14) and approval; one original TC per student, later copies say
// "Duplicate" with a reason. Numbers come from a running series per type and
// year and are never reused. Each certificate carries a random QR code that
// opens a public check showing only number, type, date and "Valid".
import "server-only";

import type { CertificateType, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { requestApproval } from "../approvals";
import { nextNumber } from "../sequences";
import { currentYear } from "../academic/years";
import { formatDate } from "../format";
import { esc } from "../pdf";
import { fileStore } from "../storage";
import { getStudentSettings } from "./settings";
import { StudentProblem } from "./students";
import { blockMessage, isCleared, refreshClearance } from "./leaving";
import { newVerifyCode, qrSvg } from "./codes";
import { CERTIFICATE_LABEL, CERTIFICATE_SHORT } from "./labels";

export type NewCertificate = {
  studentId: string;
  type: CertificateType;
  purpose: string | null;
  issueDate: Date;
  signatoryId: string | null;
  conduct?: string | null;
  duplicateReason?: string | null;
};

/** Does this type wait for approval? TC always; others as set in Student Settings (Forms & Approvals). */
export async function needsApproval(tx: Tx, ctx: SchoolContext, type: CertificateType) {
  if (type === "TC") return true;
  const s = await getStudentSettings(tx, ctx);
  return s.approvalCertificates.includes(type);
}

/** Why a TC cannot be given now, in plain words, or null. Runs the clearance checks again. */
export async function tcBlock(tx: Tx, ctx: SchoolContext, studentId: string) {
  const req = await tx.leavingRequest.findFirst({ where: { studentId, status: { in: ["IN_PROGRESS", "LEFT"] } }, orderBy: { createdAt: "desc" } });
  if (!req) return { message: "A TC is given only to a student who is leaving. Start leaving on Leaving & Alumni first.", leavingRequestId: null };
  const checks = await refreshClearance(tx, ctx, req.id);
  if (!isCleared(checks)) return { message: blockMessage(checks) ?? "Clearance is not complete.", leavingRequestId: req.id };
  return { message: null, leavingRequestId: req.id };
}

/** The original TC already issued, if any. */
export async function originalTc(tx: Tx, studentId: string) {
  return tx.certificate.findFirst({ where: { studentId, type: "TC", isDuplicate: false, status: { in: ["APPROVED", "ISSUED"] } } });
}

async function assignNumber(tx: Tx, ctx: SchoolContext, type: CertificateType) {
  const year = await currentYear(tx, ctx);
  const yearName = year?.name ?? String(new Date().getUTCFullYear());
  const n = await nextNumber(tx, ctx, `certificate:${type}:${yearName}`);
  return `${CERTIFICATE_SHORT[type].toUpperCase()}/${yearName}/${String(n).padStart(4, "0")}`;
}

export async function requestCertificate(tx: Tx, ctx: SchoolContext, input: NewCertificate) {
  const student = await tx.student.findFirst({ where: { id: input.studentId, archivedAt: null } });
  if (!student) throw new StudentProblem("Choose the student.", "studentId");
  const settings = await getStudentSettings(tx, ctx);
  if (input.type === "MIGRATION" && !settings.migrationOn) throw new StudentProblem("Migration certificates are switched off (Student Settings, Certificates).", "type");
  if (input.type === "BONAFIDE" && !input.purpose?.trim()) throw new StudentProblem("Write the purpose, for example \"bank account opening\".", "purpose");
  if (input.signatoryId) {
    const sig = await tx.signatory.findFirst({ where: { id: input.signatoryId, archivedAt: null } });
    if (!sig) throw new StudentProblem("Choose the signatory.", "signatoryId");
  } else if (input.type === "CHARACTER") {
    throw new StudentProblem("A conduct or character certificate is signed by an authorised signatory. Choose one.", "signatoryId");
  }

  let leavingRequestId: string | null = null;
  let isDuplicate = false;
  let originalId: string | null = null;
  if (input.type === "TC") {
    const block = await tcBlock(tx, ctx, student.id);
    if (block.message) throw new StudentProblem(block.message, "type");
    leavingRequestId = block.leavingRequestId;
    const original = await originalTc(tx, student.id);
    if (original) {
      if (!input.duplicateReason || input.duplicateReason.trim().length < 5) {
        throw new StudentProblem(`An original TC was issued on ${formatDate(original.issuedAt ?? original.issueDate)}. To print a duplicate, give the reason.`, "duplicateReason");
      }
      isDuplicate = true;
      originalId = original.id;
    }
    const waiting = await tx.certificate.findFirst({ where: { studentId: student.id, type: "TC", status: "REQUESTED" } });
    if (waiting) throw new StudentProblem("A TC for this student is already waiting for approval.", "type");
  }

  const approval = await needsApproval(tx, ctx, input.type);
  const cert = await tx.certificate.create({
    data: {
      schoolId: ctx.schoolId,
      studentId: student.id,
      type: input.type,
      purpose: input.purpose?.trim() || null,
      issueDate: input.issueDate,
      signatoryId: input.signatoryId,
      status: approval ? "REQUESTED" : "ISSUED",
      number: approval ? null : await assignNumber(tx, ctx, input.type),
      isDuplicate,
      duplicateReason: isDuplicate ? input.duplicateReason!.trim() : null,
      originalId,
      leavingRequestId,
      verifyCode: newVerifyCode(),
      data: { conduct: input.conduct?.trim() || "Good" },
      requestedById: ctx.userId,
      issuedById: approval ? null : ctx.userId,
      issuedAt: approval ? null : new Date(),
    },
  });
  if (!approval) await snapshot(tx, cert.id);
  if (approval) {
    const a = await requestApproval(tx, ctx, {
      type: "certificate",
      recordType: "Certificate",
      recordId: cert.id,
      summary: `${isDuplicate ? "Duplicate " : ""}${CERTIFICATE_LABEL[input.type]} for ${student.fullName} (${student.admissionNo})`,
      reason: input.purpose ?? input.duplicateReason ?? null,
    });
    await tx.certificate.update({ where: { id: cert.id }, data: { approvalId: a.id } });
  }
  await writeAudit(tx, ctx, {
    action: approval ? "requested" : "issued",
    recordType: "Certificate",
    recordId: cert.id,
    after: { type: input.type, studentId: student.id, number: cert.number, duplicate: isDuplicate, reason: cert.duplicateReason },
  });
  return cert;
}

/** Approvals calls this when a certificate request is decided. */
export async function certificateDecided(tx: Tx, ctx: SchoolContext, certificateId: string, approved: boolean, note: string | null) {
  const cert = await tx.certificate.findUnique({ where: { id: certificateId } });
  if (!cert || cert.status !== "REQUESTED") return;
  if (approved) {
    const number = await assignNumber(tx, ctx, cert.type);
    await tx.certificate.update({ where: { id: cert.id }, data: { status: "APPROVED", number, approvedById: ctx.userId } });
    await writeAudit(tx, ctx, { action: "approved", recordType: "Certificate", recordId: cert.id, before: { status: "REQUESTED" }, after: { status: "APPROVED", number } });
  } else {
    await tx.certificate.update({ where: { id: cert.id }, data: { status: "CANCELLED", cancelReason: note ?? "Not approved" } });
    await writeAudit(tx, ctx, { action: "not-approved", recordType: "Certificate", recordId: cert.id, before: { status: "REQUESTED" }, after: { status: "CANCELLED", note } });
  }
}

/** Issue (print) an approved certificate. A TC is checked for clearance again at this moment. */
export async function issueCertificate(tx: Tx, ctx: SchoolContext, certificateId: string) {
  const cert = await tx.certificate.findUnique({ where: { id: certificateId } });
  if (!cert) throw new StudentProblem("This certificate was not found.");
  if (cert.status === "ISSUED") return cert;
  if (cert.status !== "APPROVED") throw new StudentProblem(cert.status === "REQUESTED" ? "This certificate is still waiting for approval." : "This certificate was cancelled.");
  if (cert.type === "TC") {
    const block = await tcBlock(tx, ctx, cert.studentId);
    if (block.message) throw new StudentProblem(block.message);
  }
  const issued = await tx.certificate.update({ where: { id: cert.id }, data: { status: "ISSUED", issuedById: ctx.userId, issuedAt: new Date() } });
  await snapshot(tx, cert.id);
  await writeAudit(tx, ctx, { action: "issued", recordType: "Certificate", recordId: cert.id, before: { status: "APPROVED" }, after: { status: "ISSUED", number: cert.number } });
  return issued;
}

export async function cancelCertificate(tx: Tx, ctx: SchoolContext, certificateId: string, reason: string) {
  if (reason.trim().length < 5) throw new StudentProblem("Give a reason of at least 5 characters.", "reason");
  const cert = await tx.certificate.findUnique({ where: { id: certificateId } });
  if (!cert || cert.status === "CANCELLED") throw new StudentProblem("This certificate is already cancelled.");
  await tx.certificate.update({ where: { id: cert.id }, data: { status: "CANCELLED", cancelReason: reason.trim() } });
  if (cert.approvalId && cert.status === "REQUESTED") {
    await tx.approval.updateMany({ where: { id: cert.approvalId, status: { in: ["WAITING", "ESCALATED"] } }, data: { status: "WITHDRAWN", decisionReason: "Certificate cancelled" } });
  }
  await writeAudit(tx, ctx, { action: "cancelled", recordType: "Certificate", recordId: cert.id, before: { status: cert.status }, after: { status: "CANCELLED", reason: reason.trim() } });
}

const GENDER_WORDS = (g: string | null) => (g === "Female" ? { child: "daughter", he: "she", his: "her" } : g === "Male" ? { child: "son", he: "he", his: "his" } : { child: "child", he: "they", his: "their" });

/** Saves the printed details at issue, so a reprint shows exactly the same. */
async function snapshot(tx: Tx, certificateId: string) {
  const cert = await tx.certificate.findUniqueOrThrow({ where: { id: certificateId } });
  const s = await tx.student.findUniqueOrThrow({
    where: { id: cert.studentId },
    include: { guardians: { where: { archivedAt: null }, include: { guardian: true } }, enrolments: { where: { archivedAt: null }, orderBy: { createdAt: "asc" } } },
  });
  const sections = await tx.section.findMany({ where: { id: { in: s.enrolments.map((e) => e.sectionId) } }, include: { schoolClass: true, academicYear: true } });
  const sec = (id: string) => sections.find((x) => x.id === id);
  const first = s.enrolments[0] ? sec(s.enrolments[0].sectionId) : undefined;
  const last = s.enrolments.length ? sec(s.enrolments[s.enrolments.length - 1].sectionId) : undefined;
  const father = s.guardians.find((g) => g.relationship === "Father")?.guardian.name ?? s.guardians.find((g) => g.isPrimary)?.guardian.name ?? "";
  const mother = s.guardians.find((g) => g.relationship === "Mother")?.guardian.name ?? "";
  const leaving = cert.leavingRequestId ? await tx.leavingRequest.findUnique({ where: { id: cert.leavingRequestId } }) : null;
  const lastEnr = s.enrolments[s.enrolments.length - 1];
  const data = {
    ...(cert.data as Record<string, unknown>),
    name: s.fullName, admissionNo: s.admissionNo, gender: s.gender, father, mother,
    dateOfBirth: s.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    category: s.category, religion: s.religion, nationality: "Indian",
    joinedOn: s.joiningDate?.toISOString().slice(0, 10) ?? null,
    firstClass: first?.schoolClass.name ?? null, lastClass: last ? `${last.schoolClass.name} ${last.name}` : null, lastClassName: last?.schoolClass.name ?? null,
    lastYear: last?.academicYear.name ?? null, lastYearEnd: last?.academicYear.endDate.toISOString().slice(0, 10) ?? null,
    promotion: lastEnr?.status === "PROMOTED" ? "Yes, promoted" : lastEnr?.status === "HELD_BACK" ? "No" : "Studying at the time of leaving",
    leavingDate: leaving?.lastDate.toISOString().slice(0, 10) ?? null, leavingReason: leaving?.reason ?? null, destination: leaving?.destinationSchool ?? null,
    appliedOn: leaving?.createdAt.toISOString().slice(0, 10) ?? null,
    apaarId: s.apaarId, pen: s.pen,
  };
  await tx.certificate.update({ where: { id: cert.id }, data: { data: data as Prisma.InputJsonValue } });
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const ORD = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth", "Thirteenth", "Fourteenth", "Fifteenth", "Sixteenth", "Seventeenth", "Eighteenth", "Nineteenth", "Twentieth"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function words(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ""}`;
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` and ${words(n % 100)}` : ""}`;
  return `${words(Math.floor(n / 1000))} Thousand${n % 1000 ? ` ${words(n % 1000)}` : ""}`;
}
function dayOrdinal(d: number) {
  if (d <= 20) return ORD[d];
  if (d === 30) return "Thirtieth";
  return `${TENS[Math.floor(d / 10)]}-${ORD[d % 10]}`;
}
/** 2015-03-14 → "Fourteenth March Two Thousand Fifteen", as written on a TC. */
export function dateInWords(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${dayOrdinal(d)} ${MONTHS[m - 1]} ${words(y)}`;
}

const dmy = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("-") : "Not on record");

export type PrintContext = {
  school: { name: string; address: string | null; board: string | null; affiliationNumber: string | null; phone: string | null; email: string | null };
  logo: string | null;
  signatory: { title: string; name: string; image: string | null } | null;
  verifyUrl: string | null;
};

/** Loads a stored file as a data: link for a PDF (PDFs make no outside requests). */
export async function fileDataUri(tx: Tx, fileId: string | null) {
  if (!fileId) return null;
  const f = await tx.storedFile.findFirst({ where: { id: fileId, archivedAt: null } });
  if (!f) return null;
  const body = await fileStore().get(f.storageKey);
  return body ? `data:${f.contentType};base64,${body.toString("base64")}` : null;
}

export async function printContext(tx: Tx, ctx: SchoolContext, cert: { signatoryId: string | null; verifyCode: string }, origin: string | null): Promise<PrintContext> {
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId } });
  const sig = cert.signatoryId ? await tx.signatory.findFirst({ where: { id: cert.signatoryId } }) : null;
  const settings = await getStudentSettings(tx, ctx);
  return {
    school: { name: school.name, address: school.address, board: school.board, affiliationNumber: school.affiliationNumber, phone: school.phone, email: school.email },
    logo: await fileDataUri(tx, school.logoFileId),
    signatory: sig ? { title: sig.title, name: sig.name, image: await fileDataUri(tx, sig.imageFileId) } : null,
    verifyUrl: settings.qrOn && origin ? `${origin}/verify/${cert.verifyCode}` : null,
  };
}

/** The certificate as a printable A4 page. Every merge field is escaped. */
export async function certificateHtml(cert: { type: CertificateType; number: string | null; issueDate: Date; purpose: string | null; isDuplicate: boolean; duplicateReason: string | null; status: string; data: unknown }, p: PrintContext) {
  const d = cert.data as Record<string, string | null>;
  const w = GENDER_WORDS(d.gender ?? null);
  const parent = d.father || d.mother || "";
  let body = "";
  if (cert.type === "TC") {
    const rows: [string, string][] = [
      ["Name of the student", d.name ?? ""],
      ["Admission number", d.admissionNo ?? ""],
      ["Father's name", d.father || "Not on record"],
      ["Mother's name", d.mother || "Not on record"],
      ["Nationality", d.nationality ?? "Indian"],
      ["Category", d.category || "Not on record"],
      ["Date of birth (in figures)", dmy(d.dateOfBirth)],
      ["Date of birth (in words)", dateInWords(d.dateOfBirth) || "Not on record"],
      ["Date of first admission, with class", `${dmy(d.joinedOn)}${d.firstClass ? `, ${d.firstClass}` : ""}`],
      ["Class in which the student last studied", d.lastClass ? `${d.lastClass} (${d.lastYear})` : "Not on record"],
      ["Whether qualified for promotion", d.promotion ?? ""],
      ["Whether all dues to the school are paid", "Yes (clearance complete)"],
      ["Date the student left", dmy(d.leavingDate)],
      ["Reason for leaving", d.leavingReason ?? ""],
      ["School the student is going to", d.destination || "Not stated"],
      ["General conduct", d.conduct ?? "Good"],
      ["Date of application for the certificate", dmy(d.appliedOn)],
      ["Date of issue of the certificate", formatDate(cert.issueDate)],
      ["APAAR ID / PEN", [d.apaarId, d.pen].filter(Boolean).join(" / ") || "Not on record"],
    ];
    body = `<table class="tc">${rows.map(([k, v], i) => `<tr><td class="n">${i + 1}.</td><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join("")}</table>`;
  } else {
    const name = `<strong>${esc(d.name)}</strong>`;
    const of = parent ? `, ${w.child} of <strong>${esc(parent)}</strong>,` : "";
    const adm = `admission number <strong>${esc(d.admissionNo)}</strong>`;
    const dob = d.dateOfBirth ? ` ${w.his[0].toUpperCase() + w.his.slice(1)} date of birth as per the school's records is <strong>${esc(dmy(d.dateOfBirth))}</strong> (${esc(dateInWords(d.dateOfBirth))}).` : "";
    if (cert.type === "BONAFIDE") {
      body = `<p>This is to certify that ${name}${of} bearing ${adm}, is a bonafide student of this school, studying in <strong>${esc(d.lastClass ?? "")}</strong> during the academic year <strong>${esc(d.lastYear ?? "")}</strong>.${dob}</p><p>This certificate is issued on request for the purpose of <strong>${esc(cert.purpose ?? "")}</strong>.</p>`;
    } else if (cert.type === "STUDY") {
      body = `<p>This is to certify that ${name}${of} bearing ${adm}, studied in this school from <strong>${esc(dmy(d.joinedOn))}</strong>${d.firstClass ? ` (admitted to ${esc(d.firstClass)})` : ""} and ${d.leavingDate ? "was last" : "is"} in<strong>${esc(d.lastClass ?? "")}</strong> in the academic year <strong>${esc(d.lastYear ?? "")}</strong>.${dob}</p>${cert.purpose ? `<p>Issued for the purpose of <strong>${esc(cert.purpose)}</strong>.</p>` : ""}`;
    } else if (cert.type === "CHARACTER") {
      body = `<p>This is to certify that ${name}${of} bearing ${adm}, has been a student of this school${d.joinedOn ? ` since <strong>${esc(dmy(d.joinedOn))}</strong>` : ""}, last in <strong>${esc(d.lastClass ?? "")}</strong>.</p><p>To the best of our knowledge, ${w.his} conduct and character during this period were <strong>${esc((d.conduct ?? "Good").toLowerCase())}</strong>.${cert.purpose ? ` This certificate is issued for the purpose of <strong>${esc(cert.purpose)}</strong>.` : ""}</p>`;
    } else {
      body = `<p>This is to certify that ${name}${of} bearing ${adm}, studied in <strong>${esc(d.lastClass ?? "")}</strong> in this school, affiliated to <strong>${esc(p.school.board ?? "the board")}</strong>, and has no objection to ${w.his} migration${cert.purpose ? ` to <strong>${esc(cert.purpose)}</strong>` : ""}.${dob}</p>`;
    }
  }
  const qr = p.verifyUrl ? await qrSvg(p.verifyUrl, 88) : "";
  const cancelled = cert.status === "CANCELLED";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 14mm; }
    body { font-family: "Noto Serif", Georgia, "Times New Roman", serif; color: #111; font-size: 12.5pt; line-height: 1.6; }
    .frame { border: 3px double #1d3a8a; padding: 18mm 14mm 14mm; min-height: 240mm; position: relative; box-sizing: border-box; }
    header { text-align: center; border-bottom: 1px solid #999; padding-bottom: 8px; margin-bottom: 18px; }
    header img { height: 64px; }
    header h1 { margin: 4px 0 0; font-size: 20pt; letter-spacing: .5px; color: #1d3a8a; }
    header p { margin: 2px 0; font-size: 10pt; color: #333; }
    h2 { text-align: center; text-transform: uppercase; letter-spacing: 2px; font-size: 15pt; margin: 6px 0 4px; text-decoration: underline; }
    .meta { display: flex; justify-content: space-between; font-size: 10.5pt; margin-bottom: 16px; }
    .dup { text-align: center; color: #b42318; font-weight: bold; letter-spacing: 3px; font-size: 13pt; }
    .cancelled { position: absolute; top: 45%; left: 0; right: 0; text-align: center; font-size: 48pt; color: rgba(180,35,24,.25); transform: rotate(-20deg); font-weight: bold; }
    p { text-align: justify; margin: 0 0 12px; }
    table.tc { width: 100%; border-collapse: collapse; font-size: 11pt; }
    table.tc td { border: 1px solid #bbb; padding: 4px 6px; vertical-align: top; }
    td.n { width: 24px; text-align: right; } td.k { width: 45%; } td.v { font-weight: bold; }
    footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 36px; }
    .sign { text-align: center; min-width: 180px; } .sign img { height: 48px; display: block; margin: 0 auto 2px; }
    .qr { text-align: center; font-size: 8pt; color: #444; } .qr svg { display: block; margin: 0 auto 2px; }
  </style></head><body><div class="frame">
    ${cancelled ? '<div class="cancelled">CANCELLED</div>' : ""}
    <header>
      ${p.logo ? `<img src="${p.logo}" alt="">` : ""}
      <h1>${esc(p.school.name)}</h1>
      ${p.school.address ? `<p>${esc(p.school.address)}</p>` : ""}
      <p>${[p.school.board ? `Affiliated to ${p.school.board}` : "", p.school.affiliationNumber ? `Affiliation No. ${p.school.affiliationNumber}` : "", p.school.phone ?? "", p.school.email ?? ""].filter(Boolean).map(esc).join(" · ")}</p>
    </header>
    ${cert.isDuplicate ? '<p class="dup">DUPLICATE</p>' : ""}
    <h2>${esc(CERTIFICATE_LABEL[cert.type].replace(/ \(TC\)$/, ""))}</h2>
    <div class="meta"><span>No. ${esc(cert.number ?? "Not yet given")}</span><span>Date: ${esc(formatDate(cert.issueDate))}</span></div>
    ${body}
    ${cert.isDuplicate && cert.duplicateReason ? `<p style="font-size:10pt">Duplicate issued because: ${esc(cert.duplicateReason)}</p>` : ""}
    <footer>
      <div class="qr">${qr ? `${qr}Scan to check this certificate` : ""}</div>
      <div class="sign">${p.signatory?.image ? `<img src="${p.signatory.image}" alt="">` : '<div style="height:48px"></div>'}<strong>${esc(p.signatory?.name ?? "")}</strong><br>${esc(p.signatory?.title ?? "Principal")}</div>
    </footer>
  </div></body></html>`;
}
