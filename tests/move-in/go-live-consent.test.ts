// Going live sends the consent request (workflow 15, step 10; gap list G42):
// each guardian of this year's students without consent on record is asked
// through Parent Link for every consent asked of every family; a custody
// restriction, an opt-out and a switched-off Parent Link are respected; the
// Consent page counts asked, answered and waiting.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { askConsentAfterGoLive } from "@/lib/move-in/service";
import { GO_LIVE_AUDIENCE, goLiveConsentStatus } from "@/lib/parent-link/consent";
import { updateSettings } from "@/lib/messaging/settings";
import { makeCommSchool } from "../communication/fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
const texts: Record<string, string> = {};

beforeAll(async () => {
  s = await makeCommSchool();
  await withSchool(s.ctx, async (tx) => {
    for (const [type, asked] of [["data-processing", true], ["photo", true], ["apaar", false]] as const) {
      texts[type] = (await tx.consentText.create({ data: { schoolId: s.school.id, consentType: type, title: `Consent ${type}`, version: 1, askedOnAdmission: asked, text: { en: "I agree to this, as written by the school." } } })).id;
    }
    // The father already gave data consent for both children; Priya's mother may not act for her.
    for (const st of [s.ravi.id, s.sita.id]) await tx.consentRecord.create({ data: { schoolId: s.school.id, guardianId: s.father.id, studentId: st, consentType: "data-processing", consentTextId: texts["data-processing"], textVersion: 1, how: "admission-form" } });
    await tx.studentGuardian.updateMany({ where: { studentId: s.priya.id, guardianId: s.teluguMother.id }, data: { restriction: "Court order" } });
  });
}, 120_000);

describe("Consent request on going live (G42)", () => {
  it("asks each guardian without consent, per consent asked of every family, in one message", async () => {
    const c = s.ctx;
    expect(await withSchool(c, (tx) => goLiveConsentStatus(tx, c))).toBeNull();
    const r = await withSchool(c, (tx) => askConsentAfterGoLive(tx, c), { timeout: 120_000 });
    expect(r).toMatchObject({ requests: 2, guardians: 4, alreadyGiven: 1 });
    expect(r!.messageId).not.toBeNull();
    const reqs = await withSchool(c, (tx) => tx.consentRequest.findMany({ where: { audienceLabel: GO_LIVE_AUDIENCE } }));
    const by = (t: string) => reqs.find((x) => x.consentType === t)!.guardianIds.sort();
    expect(by("data-processing")).toEqual([s.mother.id, s.optFather.id, s.otherFather.id].sort());
    expect(by("photo")).toEqual([s.father.id, s.mother.id, s.optFather.id, s.otherFather.id].sort());
    // APAAR is not asked of every family here, and the restricted mother is not asked at all.
    expect(reqs.some((x) => x.consentType === "apaar")).toBe(false);
    expect(reqs.some((x) => x.guardianIds.includes(s.teluguMother.id))).toBe(false);
    // One message for all the forms.
    expect(new Set(reqs.map((x) => x.messageId))).toEqual(new Set([r!.messageId]));
    const to = await withSchool(c, (tx) => tx.messageRecipient.findMany({ where: { messageId: r!.messageId! } }));
    expect(to.some((x) => x.guardianId === s.father.id)).toBe(true);
    expect(await withSchool(c, (tx) => tx.auditLogEntry.count({ where: { action: "requested-consent", recordType: "Consent Request" } }))).toBe(2);
  });

  it("counts asked, answered and waiting", async () => {
    const c = s.ctx;
    await withSchool(c, async (tx) => {
      for (const t of ["data-processing", "photo"]) await tx.consentRecord.create({ data: { schoolId: s.school.id, guardianId: s.otherFather.id, studentId: s.kiran.id, consentType: t, consentTextId: texts[t], textVersion: 1, how: "parent-link" } });
    });
    const st = await withSchool(c, (tx) => goLiveConsentStatus(tx, c));
    expect(st).toMatchObject({ asked: 4, answered: 1, waiting: 3 });
    expect(st!.byType.find((t) => t.consentType === "photo")).toMatchObject({ asked: 4, given: 1, waiting: 3 });
  });

  it("is not asked when Parent Link is switched off", async () => {
    const c = s.ctx;
    await withSchool(c, (tx) => updateSettings(tx, c, (v) => ({ ...v, parentLink: { ...v.parentLink, on: false } })));
    expect(await withSchool(c, (tx) => askConsentAfterGoLive(tx, c))).toBeNull();
  });
});
