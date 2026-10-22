// Confirm admission (02 §2, automation A2) and Undo admission, gap list G21
// and follow-up A, through the server actions with a real session:
// - every paper received or verified at admission becomes the student's
//   document (same file), named as Student Settings lists them, with the
//   photo and the previous school's last class and marks; papers uploaded,
//   verified or rejected after admission follow onto the student's record;
// - a parent on record is reused only when the phone and the name match
//   (close spellings allowed); the same phone under another name waits for
//   the admissions person to say same family or different family;
// - Undo takes the fee plan rows it made off the student's fees, and is
//   refused once a payment or attendance is recorded.
import { beforeAll, describe, expect, it, vi } from "vitest";

let token: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "sos_session" && token ? { name, value: token } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { randomUUID } from "node:crypto";
import type { Application } from "@prisma/client";
import { createSession } from "@/lib/auth/sessions";
import type { FormState } from "@/lib/forms";
import { withSchool, type SchoolContext } from "@/lib/db";
import { createApplication, type ApplicationInput } from "@/lib/admission/applications";
import { DATA_CONSENT } from "@/lib/admission/consent";
import { familyQuestion, type Conversion } from "@/lib/admission/convert";
import { rejectDocument, uploadDocument, verifyDocument } from "@/lib/admission/documents";
import { PAPER_TO_STUDENT_DOCUMENT, studentDocumentKind } from "@/lib/admission/settings";
import { DEFAULT_DOCUMENTS } from "@/lib/students/settings";
import { ensureFeeDefaults } from "@/lib/fees/settings";
import { ensureFinanceDefaults } from "@/lib/finance/settings";
import { openDraft, publishStructure, saveFeeHead, saveFeeRow } from "@/lib/fees/structure";
import { defaultSchedule } from "@/lib/fees/schedule";
import "@/lib/fees/enrolled";
import { confirmAction, undoAction } from "@/app/(school)/admission-management/decision/actions";
import { admissionSchool, applicationInput, day } from "./fixtures";
import { collect, R } from "../fees/fixture";

let t: Awaited<ReturnType<typeof admissionSchool>>;
type Who = Awaited<ReturnType<typeof t.who>>;
let counsellor: Who;
let sys: SchoolContext;

const signIn = async (userId: string) => { token = (await createSession(userId, t.school.id, { userAgent: "test" })).token; };
/** A server action's first argument: the form's previous state (unused). */
const START: FormState<unknown> = { ok: false };
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.append(k, v); return fd; };
const run = <T,>(fn: Parameters<typeof withSchool<T>>[1]) => withSchool(sys, fn);
let phoneN = 0;
const phone = () => `96${String(20000000 + (++phoneN) * 6911 + Math.floor(Math.random() * 500)).slice(0, 8)}`;

/** Confirms through the action: the success is a redirect to the result screen. */
async function confirm(appId: string, extra: Record<string, string> = {}) {
  try {
    const r = await confirmAction(START, form({ id: appId, admissionDate: "2027-04-01", ...extra }));
    return { ok: false as const, state: r };
  } catch (e) {
    const m = /^REDIRECT (.+)$/.exec((e as Error).message);
    if (!m) throw e;
    return { ok: true as const, to: m[1] };
  }
}

const stored = (contentType: string, fileName: string) => run((tx) => tx.storedFile.create({ data: { schoolId: t.school.id, storageKey: `test/${randomUUID()}`, fileName, contentType, sizeBytes: 1000, purpose: "admission-document" } }));

/** An application at the counter, approved, with data consent given, papers as asked. */
async function approved(over: Record<string, unknown> = {}, opts: { papers?: Record<string, { status: "VERIFIED" | "RECEIVED" | "REJECTED"; type: string }>; exception?: boolean } = {}): Promise<Application> {
  const cctx = counsellor.ctx;
  const app = await withSchool(cctx, (tx) => createApplication(tx, cctx, counsellor.v, counsellor.s, applicationInput(t.nextYearId, t.c1, { phone: phone(), ...over }) as ApplicationInput, { campusId: t.campusId, channel: "counter", force: true }));
  for (const [docType, p] of Object.entries(opts.papers ?? {})) {
    const f = await stored(p.type, `${docType}.${p.type === "application/pdf" ? "pdf" : "jpg"}`);
    await run((tx) => tx.applicationDocument.updateMany({ where: { applicationId: app.id, docType }, data: { fileId: f.id, status: p.status, verifiedAt: p.status === "VERIFIED" ? new Date() : null, uploadedAt: new Date() } }));
    if (!(await run((tx) => tx.applicationDocument.count({ where: { applicationId: app.id, docType } })))) {
      await run((tx) => tx.applicationDocument.create({ data: { schoolId: t.school.id, applicationId: app.id, docType, required: false, fileId: f.id, status: p.status, verifiedAt: p.status === "VERIFIED" ? new Date() : null } }));
    }
  }
  return run(async (tx) => {
    await tx.admissionConsent.create({ data: { schoolId: t.school.id, applicationId: app.id, consentType: DATA_CONSENT, version: 0, givenByName: "Parent", phone: app.phone, howGiven: "admission-form-counter", otpVerifiedAt: new Date() } });
    return tx.application.update({ where: { id: app.id }, data: { stage: "APPROVED", decidedAt: new Date(), ...(opts.exception === false ? {} : { papersException: "Papers checked at the counter (test)" }) } });
  });
}

const conversionOf = async (appId: string) => (await run((tx) => tx.application.findUniqueOrThrow({ where: { id: appId } }))).conversion as unknown as Conversion;

beforeAll(async () => {
  t = await admissionSchool("Conversion School");
  counsellor = await t.who(t.counsellor);
  sys = { schoolId: t.school.id, userId: null };
  // Class 1's fee structure for the admission year, so a new student gets a fee plan.
  const pctx: SchoolContext = { schoolId: t.school.id, userId: t.principal.id };
  await withSchool(pctx, async (tx) => {
    await ensureFeeDefaults(tx, pctx);
    await ensureFinanceDefaults(tx, pctx);
    const head = await saveFeeHead(tx, pctx, { name: "Tuition fee", kind: "tuition", taxable: false, gstRateBp: null, sacCode: null, bankAccountId: null, lateFeeApplies: true });
    const draft = await openDraft(tx, pctx, t.nextYearId, t.c1);
    await saveFeeRow(tx, pctx, draft.id, { feeHeadId: head.id, frequency: "QUARTERLY", totalPaise: R(24000), schedule: defaultSchedule("QUARTERLY", R(24000), day("2027-04-01")) });
    await publishStructure(tx, pctx, draft.id, day("2027-04-01"));
  }, { timeout: 60_000 });
}, 120_000);

describe("the papers checked at admission become the student's documents (G21)", () => {
  it("maps each admission paper to the Student Settings name, or the school's own name for it", () => {
    expect(Object.keys(PAPER_TO_STUDENT_DOCUMENT).sort()).toEqual(["aadhaar", "address-proof", "birth-certificate", "marksheet", "other", "parent-id", "photo", "transfer-certificate"]);
    expect(DEFAULT_DOCUMENTS.map((k) => k)).toEqual(expect.arrayContaining(["Aadhaar card", "Transfer certificate (previous school)", "Parent's ID proof"]));
    const ready = ["birth-certificate", "aadhaar", "photo", "address-proof", "transfer-certificate", "parent-id"].map((k) => studentDocumentKind(k, DEFAULT_DOCUMENTS));
    expect(ready).toEqual(DEFAULT_DOCUMENTS);
    const own = ["Birth Certificate (original)", "Child Aadhaar", "Father/Mother Aadhaar", "TC", "Photograph", "Residence proof", "Last year's report card"];
    expect(studentDocumentKind("birth-certificate", own)).toBe("Birth Certificate (original)");
    expect(studentDocumentKind("aadhaar", own)).toBe("Child Aadhaar");
    expect(studentDocumentKind("parent-id", own)).toBe("Father/Mother Aadhaar");
    expect(studentDocumentKind("transfer-certificate", own)).toBe("TC");
    expect(studentDocumentKind("photo", own)).toBe("Photograph");
    expect(studentDocumentKind("address-proof", own)).toBe("Residence proof");
    expect(studentDocumentKind("marksheet", own)).toBe("Last year's report card");
    // Not in the school's list: the admission name is kept.
    expect(studentDocumentKind("marksheet", DEFAULT_DOCUMENTS)).toBe("Previous marksheet");
    expect(studentDocumentKind("other", DEFAULT_DOCUMENTS)).toBe("Other certificate");
  });

  it("carries every received and verified paper (same file), sets the photo and keeps the previous school's class and marks", async () => {
    await signIn(t.counsellor.id);
    const app = await approved({ previousSchool: "Little Stars School", previousClass: "UKG", previousMarks: "A grade" }, {
      exception: false,
      papers: {
        "birth-certificate": { status: "VERIFIED", type: "application/pdf" },
        photo: { status: "VERIFIED", type: "image/jpeg" },
        "address-proof": { status: "VERIFIED", type: "application/pdf" },
        "parent-id": { status: "VERIFIED", type: "image/png" },
        // Received but not verified yet: carried, and its note says so.
        aadhaar: { status: "RECEIVED", type: "image/jpeg" },
        // Rejected: the family brings a new copy, so it is not carried.
        "transfer-certificate": { status: "REJECTED", type: "application/pdf" },
      },
    });
    const r = await confirm(app.id);
    expect(r).toMatchObject({ ok: true, to: `/admission-management/decision/${app.id}/admitted` });
    const after = await run((tx) => tx.application.findUniqueOrThrow({ where: { id: app.id } }));
    const studentId = after.studentId!;
    const docs = await run((tx) => tx.studentDocument.findMany({ where: { studentId, archivedAt: null }, orderBy: { kind: "asc" } }));
    expect(docs.map((d) => d.kind)).toEqual(["Aadhaar card", "Address proof", "Birth certificate", "Parent's ID proof", "Passport-size photo"]);
    expect(docs.every((d) => d.guardianId === null && d.note?.includes(app.applicationNo))).toBe(true);
    expect(docs.find((d) => d.kind === "Aadhaar card")?.note).toBe(`Received at admission (application ${app.applicationNo}), not verified yet`);
    expect(docs.find((d) => d.kind === "Birth certificate")?.note).toBe(`Verified at admission (application ${app.applicationNo})`);
    const papers = await run((tx) => tx.applicationDocument.findMany({ where: { applicationId: app.id, status: { in: ["VERIFIED", "RECEIVED"] } } }));
    expect(docs.map((d) => d.fileId).sort()).toEqual(papers.map((p) => p.fileId).sort());
    const rejected = await run((tx) => tx.applicationDocument.findFirstOrThrow({ where: { applicationId: app.id, status: "REJECTED" } }));
    expect(docs.some((d) => d.fileId === rejected.fileId)).toBe(false);
    const student = await run((tx) => tx.student.findUniqueOrThrow({ where: { id: studentId } }));
    expect(student.photoFileId).toBe(papers.find((p) => p.docType === "photo")!.fileId);
    expect(await run((tx) => tx.studentPreviousSchool.findUnique({ where: { studentId } }))).toMatchObject({ schoolName: "Little Stars School", lastClass: "UKG", marks: "A grade" });
    // "Documents 5 of 6" on the profile: only the rejected TC is still missing.
    const kinds = new Set(docs.map((d) => d.kind));
    expect(DEFAULT_DOCUMENTS.filter((k) => kinds.has(k))).toHaveLength(5);
    const c = await conversionOf(app.id);
    expect(c.studentDocumentIds).toHaveLength(5);
    expect(c.photoFileId).toBe(student.photoFileId);
    const audits = await run((tx) => tx.auditLogEntry.count({ where: { recordType: "Student Document", recordId: { in: docs.map((d) => d.id) }, action: "uploaded" } }));
    expect(audits).toBe(5);
    const history = await run((tx) => tx.applicationActivity.findFirstOrThrow({ where: { applicationId: app.id, kind: "admitted" } }));
    expect(history.text).toContain("5 papers added to the student's documents (1 not verified yet), with the photo.");
  });

  it("a received photo that is not verified yet is kept as a document but is not made the student's photo", async () => {
    await signIn(t.counsellor.id);
    const app = await approved({}, { papers: { photo: { status: "RECEIVED", type: "image/jpeg" } } });
    expect(await confirm(app.id)).toMatchObject({ ok: true });
    const studentId = (await run((tx) => tx.application.findUniqueOrThrow({ where: { id: app.id } }))).studentId!;
    expect(await run((tx) => tx.studentDocument.count({ where: { studentId, kind: "Passport-size photo", archivedAt: null } }))).toBe(1);
    expect(await run((tx) => tx.student.findUniqueOrThrow({ where: { id: studentId } }))).toMatchObject({ photoFileId: null });
  });

  it("admitted with papers pending: a paper uploaded, verified, replaced or rejected later follows onto the student's documents", async () => {
    await signIn(t.counsellor.id);
    const app = await approved();
    expect(await confirm(app.id)).toMatchObject({ ok: true });
    const studentId = (await run((tx) => tx.application.findUniqueOrThrow({ where: { id: app.id } }))).studentId!;
    const docsNow = () => run((tx) => tx.studentDocument.findMany({ where: { studentId, archivedAt: null } }));
    expect(await docsNow()).toEqual([]);
    const cctx = counsellor.ctx;
    const pdf = (name: string) => new File([Buffer.from(`%PDF-1.4\n% ${name}\n`)], name, { type: "application/pdf" });

    // The TC comes from the old school a week later.
    const tc = await withSchool(cctx, (tx) => uploadDocument(tx, cctx, counsellor.v, { applicationId: app.id, docType: "transfer-certificate", file: pdf("tc.pdf"), note: null }));
    let docs = await docsNow();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ kind: "Transfer certificate (previous school)", fileId: tc.fileId, note: `Received after admission (application ${app.applicationNo}), not verified yet` });

    await withSchool(cctx, (tx) => verifyDocument(tx, cctx, counsellor.v, tc.id));
    docs = await docsNow();
    expect(docs).toHaveLength(1);
    expect(docs[0].note).toBe(`Verified after admission (application ${app.applicationNo})`);

    // A clearer copy replaces the first one on the student's record.
    const again = await withSchool(cctx, (tx) => uploadDocument(tx, cctx, counsellor.v, { applicationId: app.id, docType: "transfer-certificate", file: pdf("tc-clear.pdf"), note: null }));
    docs = await docsNow();
    expect(docs.map((d) => d.fileId)).toEqual([again.fileId]);

    // Rejected: it comes off the student's documents; the family brings a new copy.
    await withSchool(cctx, (tx) => rejectDocument(tx, cctx, counsellor.v, "School", again.id, "Stamp not clear", false));
    expect(await docsNow()).toEqual([]);
    const history = await run((tx) => tx.applicationActivity.findMany({ where: { applicationId: app.id, kind: "document" }, orderBy: { at: "asc" } }));
    expect(history.map((h) => h.text)).toEqual([
      "Transfer certificate (TC) uploaded. Added to the student's documents.",
      "Transfer certificate (TC) verified. Updated on the student's documents.",
      "Transfer certificate (TC) uploaded (new copy). Added to the student's documents.",
      "Transfer certificate (TC) rejected: Stamp not clear. Taken off the student's documents.",
    ]);
    // A paper on an application that is not admitted touches no student.
    const other = await approved();
    await withSchool(cctx, (tx) => uploadDocument(tx, cctx, counsellor.v, { applicationId: other.id, docType: "birth-certificate", file: pdf("bc.pdf"), note: null }));
    expect(await run((tx) => tx.studentDocument.count({ where: { note: { contains: other.applicationNo } } }))).toBe(0);
  });
});

describe("a parent on record is reused only when the phone and the name match (follow-up A)", () => {
  let p: string;
  let ravi: { id: string };
  beforeAll(async () => {
    // A brother already in school: father Ravi Kumar on this phone.
    p = phone();
    ravi = await run(async (tx) => {
      const g = await tx.guardian.create({ data: { schoolId: t.school.id, name: "Ravi Kumar", relationship: "Father", phone: p } });
      const s = await tx.student.create({ data: { schoolId: t.school.id, campusId: t.campusId, admissionNo: `OLD-${randomUUID().slice(0, 6)}`, firstName: "Arjun", fullName: "Arjun Kumar" } });
      await tx.studentGuardian.create({ data: { schoolId: t.school.id, studentId: s.id, guardianId: g.id, relationship: "Father", isPrimary: true } });
      return g;
    });
  });

  it("links the same father when the name is written another way (close spelling)", async () => {
    await signIn(t.counsellor.id);
    const app = await approved({ phone: p, fatherName: "Ravi Kumaar" });
    expect(await run((tx) => familyQuestion(tx, app))).toBeNull();
    expect(await confirm(app.id)).toMatchObject({ ok: true });
    const c = await conversionOf(app.id);
    expect(c.linkedGuardianIds).toEqual([ravi.id]);
    expect(c.newGuardianIds).toEqual([]);
  });

  it("asks before converting when the phone is on record under another name, and changes nothing until answered", async () => {
    await signIn(t.counsellor.id);
    const app = await approved({ phone: p, fatherName: "Suresh Babu" });
    const q = await run((tx) => familyQuestion(tx, app));
    expect(q?.question).toMatch(new RegExp(`Phone ${p} is already on record for Ravi Kumar \\(parent of Arjun Kumar(, [^)]+)?\\), not for Suresh Babu named on this form\\. Say whether this is the same family\\.`));
    expect(q?.options.map((o) => o.value)).toEqual([`same:${ravi.id}`, "new"]);
    const r = await confirm(app.id);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.state?.message).toMatch(/Say whether this is the same family/);
      expect(r.state?.errors?.family).toBeTruthy();
    }
    expect(await run((tx) => tx.application.findUniqueOrThrow({ where: { id: app.id } }))).toMatchObject({ stage: "APPROVED", studentId: null });
    // A choice not offered is refused.
    const wrong = await confirm(app.id, { family: `same:${randomUUID()}` });
    expect(wrong.ok).toBe(false);
  });

  it("a different family: a new parent with this phone, the parent on record is not touched", async () => {
    await signIn(t.counsellor.id);
    const app = await approved({ phone: p, fatherName: "Suresh Babu" });
    expect(await confirm(app.id, { family: "new" })).toMatchObject({ ok: true });
    const c = await conversionOf(app.id);
    expect(c.linkedGuardianIds).toEqual([]);
    expect(c.family).toBe("new");
    const made = await run((tx) => tx.guardian.findUniqueOrThrow({ where: { id: c.newGuardianIds[0] } }));
    expect(made).toMatchObject({ name: "Suresh Babu", phone: p });
    const raviKids = await run((tx) => tx.studentGuardian.count({ where: { guardianId: ravi.id, archivedAt: null } }));
    expect(raviKids).toBe(2); // Arjun and the close-spelling brother above, not this child.
  });

  it("the same family: the parent on record is linked, and nobody new is made for that parent", async () => {
    await signIn(t.counsellor.id);
    const app = await approved({ phone: p, fatherName: "R. K. Varma" });
    expect(await confirm(app.id, { family: `same:${ravi.id}` })).toMatchObject({ ok: true });
    const c = await conversionOf(app.id);
    expect(c.linkedGuardianIds).toEqual([ravi.id]);
    expect(c.newGuardianIds).toEqual([]);
  });

  it("the same family, with only the mother on the form: the mother is new, and the father on record is linked too", async () => {
    await signIn(t.counsellor.id);
    const app = await approved({ phone: p, fatherName: null, motherName: "Sunita Devi" });
    expect(await confirm(app.id, { family: `same:${ravi.id}` })).toMatchObject({ ok: true });
    const c = await conversionOf(app.id);
    expect(c.linkedGuardianIds).toEqual([ravi.id]);
    const mother = await run((tx) => tx.guardian.findUniqueOrThrow({ where: { id: c.newGuardianIds[0] } }));
    expect(mother).toMatchObject({ name: "Sunita Devi", relationship: "Mother" });
    const links = await run((tx) => tx.studentGuardian.findMany({ where: { id: { in: c.linkIds } } }));
    expect(links.map((l) => l.relationship).sort()).toEqual(["Father", "Mother"]);
  });
});

describe("Undo admission takes the fee plan back, and only while nothing else has happened (G21)", () => {
  it("removes the fee rows the admission made, with the reason, and a second admission gets a fresh plan", async () => {
    await signIn(t.principal.id);
    const app = await approved({}, { papers: { photo: { status: "VERIFIED", type: "image/jpeg" } } });
    expect(await confirm(app.id)).toMatchObject({ ok: true });
    const c = await conversionOf(app.id);
    const studentId = (await run((tx) => tx.application.findUniqueOrThrow({ where: { id: app.id } }))).studentId!;
    expect(c.feeDueIds?.length).toBe(4);
    const open = await run((tx) => tx.studentFeeDue.findMany({ where: { studentId, state: "OPEN" } }));
    expect(open.map((d) => d.id).sort()).toEqual([...c.feeDueIds!].sort());

    const r = await undoAction(START, form({ id: app.id }));
    expect(r).toMatchObject({ ok: true });
    const rows = await run((tx) => tx.studentFeeDue.findMany({ where: { studentId } }));
    expect(rows).toHaveLength(4);
    expect(rows.every((d) => d.state === "REMOVED" && d.removedReason === "Admission undone")).toBe(true);
    expect(await run((tx) => tx.studentDocument.count({ where: { studentId, archivedAt: null } }))).toBe(0);
    expect(await run((tx) => tx.student.findUniqueOrThrow({ where: { id: studentId } }))).toMatchObject({ photoFileId: null, status: "INACTIVE" });
    expect(await run((tx) => tx.auditLogEntry.count({ where: { recordType: "Student Fee Due", recordId: studentId, action: "removed" } }))).toBe(1);

    // Admitted again: a new student with its own fee plan and documents.
    expect(await confirm(app.id)).toMatchObject({ ok: true });
    const again = await run((tx) => tx.application.findUniqueOrThrow({ where: { id: app.id } }));
    expect(again.studentId).not.toBe(studentId);
    expect(await run((tx) => tx.studentFeeDue.count({ where: { studentId: again.studentId!, state: "OPEN" } }))).toBe(4);
    expect(await run((tx) => tx.studentDocument.count({ where: { studentId: again.studentId!, archivedAt: null } }))).toBe(1);
  });

  it("is refused once a fee payment is recorded for the student", async () => {
    await signIn(t.principal.id);
    const app = await approved();
    expect(await confirm(app.id)).toMatchObject({ ok: true });
    const studentId = (await run((tx) => tx.application.findUniqueOrThrow({ where: { id: app.id } }))).studentId!;
    const pctx: SchoolContext = { schoolId: t.school.id, userId: t.principal.id };
    const due = (await run((tx) => tx.studentFeeDue.findFirstOrThrow({ where: { studentId, state: "OPEN" }, orderBy: { dueDate: "asc" } })));
    await collect(pctx, { studentId, dueIds: [due.id], amountPaise: R(1000) }, ["principal"]);
    const r = await undoAction(START, form({ id: app.id }));
    expect(r).toMatchObject({ ok: false });
    expect(r?.message).toMatch(/A fee payment is already recorded for this student, so the admission cannot be undone/);
    expect(await run((tx) => tx.student.findUniqueOrThrow({ where: { id: studentId } }))).toMatchObject({ archivedAt: null });
    expect(await run((tx) => tx.studentFeeDue.count({ where: { studentId, state: "REMOVED" } }))).toBe(0);
  });

  it("is refused once attendance is marked for the student", async () => {
    await signIn(t.principal.id);
    const app = await approved();
    expect(await confirm(app.id)).toMatchObject({ ok: true });
    const studentId = (await run((tx) => tx.application.findUniqueOrThrow({ where: { id: app.id } }))).studentId!;
    await run((tx) => tx.attendanceMark.create({ data: { schoolId: t.school.id, academicYearId: t.nextYearId, studentId, date: day("2027-04-01"), statusKey: "present" } }));
    const r = await undoAction(START, form({ id: app.id }));
    expect(r?.message).toMatch(/Attendance is already recorded for this student/);
    expect(await run((tx) => tx.studentFeeDue.count({ where: { studentId, state: "OPEN" } }))).toBe(4);
  });
});
