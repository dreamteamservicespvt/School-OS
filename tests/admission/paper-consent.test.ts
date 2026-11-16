// Consent on a signed paper form at the counter (decision 23, 16 November 2026).
// WhatsApp never delivers one-time codes to Indian (+91) numbers and SMS is off,
// so the office records a consent form the parent signed on paper: the same
// consent types, the parent's name as signed, and optionally a photo of the form.
// - recorded like a code-confirmed consent, marked "admission-paper-form", with
//   who recorded it, when, and the file; the history line and the audit entry are
//   written in the same transaction;
// - only the admission team (Full) may record it, as for the code;
// - another school can never record it on, or see, this school's application;
// - the code path is unchanged;
// - the paper form is the way while no code can go (no SMS);
// - at admission it becomes the student's Consent Record marked "paper-form".
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

import { createSession } from "@/lib/auth/sessions";
import type { FormState } from "@/lib/forms";
import { withSchool } from "@/lib/db";
import { createApplication, type ApplicationInput } from "@/lib/admission/applications";
import { confirmConsentAtCounter, counterCodeCanGo, DATA_CONSENT, hasDataConsent, PAPER_HOW, PHOTO_CONSENT, recordPaperConsent, sendConsentCode } from "@/lib/admission/consent";
import { paperConsentAction } from "@/app/(school)/admission-management/applications/actions";
import { admissionSchool, applicationInput } from "./fixtures";

let t: Awaited<ReturnType<typeof admissionSchool>>;
let other: Awaited<ReturnType<typeof admissionSchool>>;
type Who = Awaited<ReturnType<typeof t.who>>;
let counsellor: Who, vp: Who, frontdesk: Who, otherCounsellor: Who;

const START: FormState<unknown> = { ok: false };
const signIn = async (userId: string, schoolId = t.school.id) => { token = (await createSession(userId, schoolId, { userAgent: "test" })).token; };
let n = 0;
const phone = () => `95${String(30000000 + (++n) * 7121 + Math.floor(Math.random() * 400)).slice(0, 8)}`;
const pdf = (name: string) => new File([Buffer.from(`%PDF-1.4\n% ${name}\n`)], name, { type: "application/pdf" });

async function newApp(school = t, who = () => counsellor) {
  const w = who();
  return withSchool(w.ctx, (tx) => createApplication(tx, w.ctx, w.v, w.s, applicationInput(school.nextYearId, school.c1, { phone: phone() }) as ApplicationInput, { campusId: school.campusId, channel: "counter", force: true }));
}

beforeAll(async () => {
  t = await admissionSchool("Paper Consent School");
  other = await admissionSchool("Other Paper School");
  [counsellor, vp, frontdesk] = await Promise.all([t.counsellor, t.vp, t.frontdesk].map((u) => t.who(u)));
  otherCounsellor = await other.who(other.counsellor);
}, 120_000);

describe("consent on a signed paper form (decision 23)", () => {
  it("is recorded with the method, who recorded it, when, and the photo of the form, with the history line and the audit entry", async () => {
    const app = await newApp();
    const before = Date.now();
    const saved = await withSchool(counsellor.ctx, (tx) => recordPaperConsent(tx, counsellor.ctx, counsellor.v, "Paper Consent School", app.id, { types: [DATA_CONSENT, PHOTO_CONSENT], signedName: "Ramesh Rao", file: pdf("consent.pdf") }));
    expect(saved.sort()).toEqual([DATA_CONSENT, PHOTO_CONSENT].sort());
    const rows = await withSchool(counsellor.ctx, (tx) => tx.admissionConsent.findMany({ where: { applicationId: app.id } }));
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r).toMatchObject({ howGiven: PAPER_HOW, givenByName: "Ramesh Rao", recordedById: t.counsellor.id, otpVerifiedAt: null, withdrawnAt: null });
      expect(r.paperFileId).toBeTruthy();
      expect(r.givenAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    }
    const file = await withSchool(counsellor.ctx, (tx) => tx.storedFile.findUniqueOrThrow({ where: { id: rows[0].paperFileId! } }));
    expect(file).toMatchObject({ schoolId: t.school.id, purpose: "admission-consent-form", contentType: "application/pdf" });
    // It counts as data consent given, so the admission can go ahead.
    expect(await withSchool(counsellor.ctx, (tx) => hasDataConsent(tx, app.id))).toBe(true);
    const line = await withSchool(counsellor.ctx, (tx) => tx.applicationActivity.findFirstOrThrow({ where: { applicationId: app.id, kind: "consent" } }));
    expect(line.text).toMatch(/^Consent given on a signed paper form, recorded by Divya Staff: /);
    expect(line.text).toContain("Signed by Ramesh Rao.");
    expect(line.byId).toBe(t.counsellor.id);
    const audit = await withSchool(counsellor.ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "Application", recordId: app.id, action: "consent-given" } }));
    expect(audit.after).toMatchObject({ how: PAPER_HOW, recordedBy: t.counsellor.id, fileId: rows[0].paperFileId, givenBy: "Ramesh Rao" });
  });

  it("works without a photo of the form, and through the counter's action", async () => {
    const app = await newApp();
    await signIn(t.counsellor.id);
    const fd = new FormData();
    fd.append("id", app.id);
    fd.append(`consent_${DATA_CONSENT}`, "on");
    fd.append("signedName", "Sunita Rao");
    const r = await paperConsentAction(START, fd);
    expect(r).toMatchObject({ ok: true });
    const row = await withSchool(counsellor.ctx, (tx) => tx.admissionConsent.findFirstOrThrow({ where: { applicationId: app.id } }));
    expect(row).toMatchObject({ consentType: DATA_CONSENT, howGiven: PAPER_HOW, givenByName: "Sunita Rao", recordedById: t.counsellor.id, paperFileId: null });
  });

  it("needs the data consent and the parent's name, and is not recorded twice", async () => {
    const app = await newApp();
    const rec = (types: string[], signedName = "Ramesh Rao") => withSchool(counsellor.ctx, (tx) => recordPaperConsent(tx, counsellor.ctx, counsellor.v, "S", app.id, { types, signedName, file: null }));
    await expect(rec([PHOTO_CONSENT])).rejects.toThrow(/Data consent is needed/);
    await expect(rec([DATA_CONSENT], " R ")).rejects.toThrow(/name as signed/);
    await rec([DATA_CONSENT]);
    await expect(rec([DATA_CONSENT])).rejects.toThrow(/already given/);
    // Photo consent signed later: added on its own, the data consent stays as it was.
    expect(await rec([DATA_CONSENT, PHOTO_CONSENT])).toEqual([PHOTO_CONSENT]);
  });

  it("is refused for a role that may not confirm consent at the counter", async () => {
    const app = await newApp();
    const rec = (w: Who) => withSchool(w.ctx, (tx) => recordPaperConsent(tx, w.ctx, w.v, "S", app.id, { types: [DATA_CONSENT], signedName: "Ramesh Rao", file: null }));
    await expect(rec(vp)).rejects.toThrow();
    await expect(rec(frontdesk)).rejects.toThrow(/Only the admission team/);
    // A Teacher has no Admission Management at all: the action refuses before any work.
    await signIn(t.teacher.id);
    const fd = new FormData();
    fd.append("id", app.id);
    fd.append(`consent_${DATA_CONSENT}`, "on");
    fd.append("signedName", "Ramesh Rao");
    const r = await paperConsentAction(START, fd).catch((e: Error) => ({ ok: false, message: e.message }));
    expect(r?.ok).toBe(false);
    expect(await withSchool(counsellor.ctx, (tx) => tx.admissionConsent.count({ where: { applicationId: app.id } }))).toBe(0);
  });

  it("another school can neither record it on this school's application nor see it", async () => {
    const app = await newApp();
    await expect(withSchool(otherCounsellor.ctx, (tx) => recordPaperConsent(tx, otherCounsellor.ctx, otherCounsellor.v, "Other", app.id, { types: [DATA_CONSENT], signedName: "Intruder", file: null }))).rejects.toThrow(/not found/i);
    await withSchool(counsellor.ctx, (tx) => recordPaperConsent(tx, counsellor.ctx, counsellor.v, "S", app.id, { types: [DATA_CONSENT], signedName: "Ramesh Rao", file: pdf("form.pdf") }));
    const mine = await withSchool(counsellor.ctx, (tx) => tx.admissionConsent.findFirstOrThrow({ where: { applicationId: app.id } }));
    expect(await withSchool(otherCounsellor.ctx, (tx) => tx.admissionConsent.count({ where: { applicationId: app.id } }))).toBe(0);
    expect(await withSchool(otherCounsellor.ctx, (tx) => tx.storedFile.count({ where: { id: mine.paperFileId! } }))).toBe(0);
    expect(await withSchool(otherCounsellor.ctx, (tx) => tx.applicationActivity.count({ where: { applicationId: app.id } }))).toBe(0);
  });

  it("is the way while no code can reach the parent's phone (no SMS in the test school)", async () => {
    expect(await withSchool(counsellor.ctx, (tx) => counterCodeCanGo(tx, counsellor.ctx))).toBe(false);
  });
});

describe("the one-time code at the counter is unchanged", () => {
  it("records the consent as confirmed by the code, with no paper details", async () => {
    const app = await newApp();
    let code = "";
    const deliver = async (_: string, text: string) => { code = /\d{6}/.exec(text)![0]; return true; };
    await withSchool(counsellor.ctx, (tx) => sendConsentCode(tx, counsellor.ctx, counsellor.v, "S", app.id, { deliver }));
    await withSchool(counsellor.ctx, (tx) => confirmConsentAtCounter(tx, counsellor.ctx, counsellor.v, "S", app.id, { code, types: [DATA_CONSENT], givenByName: "Father" }));
    const row = await withSchool(counsellor.ctx, (tx) => tx.admissionConsent.findFirstOrThrow({ where: { applicationId: app.id } }));
    expect(row).toMatchObject({ howGiven: "admission-form-counter", givenByName: "Father", recordedById: null, paperFileId: null });
    expect(row.otpVerifiedAt).toBeInstanceOf(Date);
    const line = await withSchool(counsellor.ctx, (tx) => tx.applicationActivity.findFirstOrThrow({ where: { applicationId: app.id, kind: "consent" } }));
    expect(line.text).toMatch(/^Consent given by Father, confirmed by a one-time code: /);
    const audit = await withSchool(counsellor.ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "Application", recordId: app.id, action: "consent-given" } }));
    expect(audit.after).toMatchObject({ how: "admission-form-counter", givenBy: "Father" });
    expect(audit.after).not.toHaveProperty("fileId");
  });

  it("still refuses a wrong code", async () => {
    const app = await newApp();
    let code = "";
    const deliver = async (_: string, text: string) => { code = /\d{6}/.exec(text)![0]; return true; };
    await withSchool(counsellor.ctx, (tx) => sendConsentCode(tx, counsellor.ctx, counsellor.v, "S", app.id, { deliver }));
    const wrong = code === "000000" ? "111111" : "000000";
    await expect(withSchool(counsellor.ctx, (tx) => confirmConsentAtCounter(tx, counsellor.ctx, counsellor.v, "S", app.id, { code: wrong, types: [DATA_CONSENT], givenByName: "Father" }))).rejects.toThrow(/not right/);
    expect(await withSchool(counsellor.ctx, (tx) => tx.admissionConsent.count({ where: { applicationId: app.id } }))).toBe(0);
  });
});
