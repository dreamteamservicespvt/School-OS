// APAAR consent (gap list G42): its own purpose, never bundled with data
// consent; a parent's consent for the child (a minor), shown with the APAAR
// ID, counted on the Consent page, asked with the other consents, and
// withdrawn like any other.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { apaarConsentOf, consentRows, requestConsent, withdrawConsent } from "@/lib/students/consent";
import { consentLog } from "@/lib/students/consent-log";
import { savePaperConsent } from "@/lib/students/paper-consent";
import { makeCommSchool } from "../communication/fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
const texts: Record<string, string> = {};

beforeAll(async () => {
  s = await makeCommSchool();
  await withSchool(s.ctx, async (tx) => {
    for (const type of ["data-processing", "apaar"]) {
      texts[type] = (await tx.consentText.create({ data: { schoolId: s.school.id, consentType: type, title: type === "apaar" ? "APAAR ID" : "Use of the child's data", version: 1, askedOnAdmission: type !== "apaar", text: { en: "As the parent of my child, I agree to this, as written by the school." } } })).id;
    }
  });
}, 120_000);

describe("APAAR consent (G42)", () => {
  it("is given by one parent for the child, kept apart from data consent, and shown with who gave it and how", async () => {
    const c = s.ctx;
    expect(await withSchool(c, (tx) => apaarConsentOf(tx, c, s.ravi.id))).toMatchObject({ state: "NONE" });
    await withSchool(c, (tx) => savePaperConsent(tx, c, { studentId: s.ravi.id, studentName: "Ravi Kumar", guardianId: s.mother.id, guardianName: "Lakshmi Kumar", consentType: "apaar", consentTextId: texts.apaar, textVersion: 1, refused: false, formDate: new Date("2026-06-12T00:00:00Z") }));
    expect(await withSchool(c, (tx) => apaarConsentOf(tx, c, s.ravi.id))).toMatchObject({ state: "GIVEN", guardianName: "Lakshmi Kumar", how: "paper-form" });
    // Data consent is a separate purpose: still not given.
    const data = await withSchool(c, (tx) => consentRows(tx, c, { studentIds: [s.ravi.id], consentType: "data-processing" }));
    expect(data).toHaveLength(0);
    const log = await withSchool(c, (tx) => consentLog(tx, c));
    expect(log.find((t) => t.consentType === "apaar")!.totals).toMatchObject({ total: 5, given: 1, fromPaper: 1 });
    expect(log.find((t) => t.consentType === "data-processing")!.totals.given).toBe(0);
  });

  it("a parent with a custody restriction never gives it for that child", async () => {
    const c = s.ctx;
    await withSchool(c, async (tx) => {
      await tx.studentGuardian.updateMany({ where: { studentId: s.priya.id, guardianId: s.teluguMother.id }, data: { restriction: "Court order" } });
      await tx.consentRecord.create({ data: { schoolId: s.school.id, guardianId: s.teluguMother.id, studentId: s.priya.id, consentType: "apaar", consentTextId: texts.apaar, textVersion: 1, how: "parent-link" } });
    });
    expect(await withSchool(c, (tx) => apaarConsentOf(tx, c, s.priya.id))).toMatchObject({ state: "NONE" });
  });

  it("is asked with the other consents the school has texts for, and can be withdrawn on its own", async () => {
    const c = s.ctx;
    await withSchool(c, (tx) => requestConsent(tx, c, [s.otherFather.id]));
    const reqs = await withSchool(c, (tx) => tx.consentRequest.findMany({ where: { guardianIds: { has: s.otherFather.id } } }));
    expect(reqs.map((r) => r.consentType).sort()).toEqual(["apaar", "data-processing"]);

    await withSchool(c, (tx) => withdrawConsent(tx, c, { guardianId: s.mother.id, consentType: "apaar", studentId: s.ravi.id, note: "Letter dated 01-08-2026" }));
    expect(await withSchool(c, (tx) => apaarConsentOf(tx, c, s.ravi.id))).toMatchObject({ state: "WITHDRAWN", guardianName: "Lakshmi Kumar" });
    // The record stays, with the withdrawal.
    const recs = await withSchool(c, (tx) => tx.consentRecord.findMany({ where: { studentId: s.ravi.id, consentType: "apaar" } }));
    expect(recs).toHaveLength(1);
    expect(recs[0].withdrawnAt).not.toBeNull();
  });
});
