// Admission Management rules (02): who may do what (05-roles.md), "own" reach
// filtered in the query, enquiry numbers, the date filter, the consent code,
// the online form, the fee link and Admission Settings.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { readListParams } from "@/lib/list";
import { periodFromSearch } from "@/lib/periods";
import { canWorkOn, enquiryScope, requireFull } from "@/lib/admission/access";
import { createEnquiry, type EnquiryInput } from "@/lib/admission/enquiries";
import { createApplication, type ApplicationInput } from "@/lib/admission/applications";
import { applicationWhere, enquiryWhere, ENQUIRY_FILTERS } from "@/lib/admission/list";
import { startOtp, tryOtp, verifyOtp, OTP_MAX_TRIES } from "@/lib/admission/consent";
import { applicationStatus, checkStatusToken, publicForm, sendFeeLink, submitOnline, statusToken } from "@/lib/admission/public";
import { saveList, saveRules } from "@/lib/admission/settings-save";
import { loadSettings } from "@/lib/admission/settings";
import { report } from "@/lib/admission/reports";
import { names } from "@/lib/admission/choices";
import { admissionSchool, applicationInput, day } from "./fixtures";

let t: Awaited<ReturnType<typeof admissionSchool>>;
type Who = Awaited<ReturnType<typeof t.who>>;
let principal: Who, counsellor: Who, vp: Who, frontdesk: Who, teacher: Who;

const enquiry = (over: Partial<EnquiryInput> = {}): EnquiryInput => ({
  childName: "Aarav", parentName: "Suresh", phone: "9123456780", email: null, classId: null, source: "walk-in", ownerStaffId: null,
  nextFollowUpAt: new Date(Date.now() + 86_400_000), nextAction: null, childDob: null, currentSchool: null, referredBy: null, notes: null, ...over,
});

beforeAll(async () => {
  t = await admissionSchool();
  [principal, counsellor, vp, frontdesk, teacher] = await Promise.all([t.principal, t.counsellor, t.vp, t.frontdesk, t.teacher].map((u) => t.who(u)));
});

describe("roles (05-roles.md, Admission Management)", () => {
  it("gives Full to the Principal and Admission Counsellor, View to the Vice Principal, Own to the Receptionist and nothing to a Teacher", () => {
    expect([principal.v.see, principal.v.change]).toEqual(["all", "all"]);
    expect([counsellor.v.see, counsellor.v.change]).toEqual(["all", "all"]);
    expect([vp.v.see, vp.v.change]).toEqual(["all", "none"]);
    expect([frontdesk.v.see, frontdesk.v.change]).toEqual(["own", "own"]);
    expect([teacher.v.see, teacher.v.change]).toEqual(["none", "none"]);
  });

  it("refuses at the server what each role may not do (requireAction uses the same check)", () => {
    expect(can(teacher.permissions, "admission-management", "view")).toBe(false);
    expect(can(vp.permissions, "admission-management", "view")).toBe(true);
    expect(can(vp.permissions, "admission-management", "create")).toBe(false);
    expect(can(vp.permissions, "admission-management", "edit")).toBe(false);
    expect(can(frontdesk.permissions, "admission-management", "create")).toBe(true);
    expect(() => requireFull(frontdesk.v, "applications")).toThrow(/Only the admission team/);
    expect(() => requireFull(vp.v)).toThrow();
    expect(() => requireFull(counsellor.v)).not.toThrow();
  });

  it("does not let the Vice Principal add an enquiry, or the Receptionist make an application", async () => {
    await expect(withSchool(vp.ctx, (tx) => createEnquiry(tx, vp.ctx, vp.v, vp.s, enquiry({ phone: "9123400001" }), { yearId: t.nextYearId, campusId: t.campusId, today: "2026-10-12" }))).rejects.toThrow(/cannot add enquiries/);
    await expect(withSchool(frontdesk.ctx, (tx) => createApplication(tx, frontdesk.ctx, frontdesk.v, frontdesk.s, applicationInput(t.nextYearId, t.c1) as ApplicationInput, { campusId: t.campusId, channel: "counter" }))).rejects.toThrow(/Only the admission team/);
    await withSchool(principal.ctx, async (tx) => expect(await tx.application.count()).toBe(0));
  });

  it("does not let the Receptionist change Admission Settings or send a fee link", async () => {
    await expect(withSchool(frontdesk.ctx, async (tx) => {
      const s = await loadSettings(tx, frontdesk.ctx);
      return saveRules(tx, frontdesk.ctx, frontdesk.v, { admissionYearId: null, applicationPrefix: "APP/{YYYY}/", allowOverCapacity: true, admitWithPapersPending: true, waitingListOn: s.waitingListOn, siblingPriorityOn: false, siblingWeight: 20, quotaOn: false, quotas: [], onlineOn: true, applicationFeeOn: false, offerLettersOn: false, campaignsOn: false });
    })).rejects.toThrow(/Only the admission team/);
    await expect(withSchool(frontdesk.ctx, (tx) => sendFeeLink(tx, frontdesk.ctx, frontdesk.v, "00000000-0000-0000-0000-000000000000"))).rejects.toThrow(/Only the admission team/);
  });
});

describe("enquiries", () => {
  it("numbers enquiries one after another and never twice", async () => {
    const [a, b] = await withSchool(counsellor.ctx, async (tx) => [
      await createEnquiry(tx, counsellor.ctx, counsellor.v, counsellor.s, enquiry({ phone: "9123400011" }), { yearId: t.nextYearId, campusId: t.campusId, today: "2026-10-12" }),
      await createEnquiry(tx, counsellor.ctx, counsellor.v, counsellor.s, enquiry({ phone: "9123400012", childName: "Diya" }), { yearId: t.nextYearId, campusId: t.campusId, today: "2026-10-12" }),
    ]);
    expect(a.enquiryNo).not.toBe(b.enquiryNo);
    const num = (s: string | null) => Number((s ?? "").replace(/\D/g, "").slice(-4));
    expect(num(b.enquiryNo)).toBe(num(a.enquiryNo) + 1);
  });

  it("shows the Receptionist only the enquiries they own or added, in the query itself", async () => {
    const mine = await withSchool(frontdesk.ctx, (tx) => createEnquiry(tx, frontdesk.ctx, frontdesk.v, frontdesk.s, enquiry({ phone: "9123400021", childName: "Front desk child" }), { yearId: t.nextYearId, campusId: t.campusId, today: "2026-10-12" }));
    const other = await withSchool(counsellor.ctx, (tx) => createEnquiry(tx, counsellor.ctx, counsellor.v, counsellor.s, enquiry({ phone: "9123400022", childName: "Counsellor child", ownerStaffId: t.counsellorStaff }), { yearId: t.nextYearId, campusId: t.campusId, today: "2026-10-12" }));
    const params = readListParams({}, ENQUIRY_FILTERS);
    const seen = await withSchool(frontdesk.ctx, (tx) => tx.enquiry.findMany({ where: enquiryWhere(params, frontdesk.v, { yearId: t.nextYearId, timeZone: "Asia/Kolkata" }), select: { id: true } }));
    expect(seen.map((e) => e.id)).toContain(mine.id);
    expect(seen.map((e) => e.id)).not.toContain(other.id);
    expect(await withSchool(frontdesk.ctx, (tx) => tx.enquiry.findFirst({ where: { id: other.id, ...enquiryScope(frontdesk.v) } }))).toBeNull();
    expect(canWorkOn(frontdesk.v, other)).toBe(false);
    expect(canWorkOn(frontdesk.v, mine)).toBe(true);
    const all = await withSchool(principal.ctx, (tx) => tx.enquiry.findMany({ where: enquiryWhere(params, principal.v, { yearId: t.nextYearId, timeZone: "Asia/Kolkata" }), select: { id: true } }));
    expect(all.map((e) => e.id)).toEqual(expect.arrayContaining([mine.id, other.id]));
  });

  it("filters by the day added (P2 date filter), in the school's time zone", async () => {
    const old = await withSchool(counsellor.ctx, async (tx) => {
      const e = await createEnquiry(tx, counsellor.ctx, counsellor.v, counsellor.s, enquiry({ phone: "9123400031", childName: "Old enquiry" }), { yearId: t.nextYearId, campusId: t.campusId, today: "2026-10-12" });
      // 1 Sep 2026, 11:30 PM in India is still 1 Sep there, though 2 Sep has not begun in UTC either way.
      await tx.enquiry.update({ where: { id: e.id }, data: { createdAt: new Date("2026-09-01T18:00:00Z") } });
      return e;
    });
    const params = readListParams({}, ENQUIRY_FILTERS);
    const sept1 = periodFromSearch({ period: "custom", from: "2026-09-01", to: "2026-09-01" }, { timeZone: "Asia/Kolkata" });
    const sept2 = periodFromSearch({ period: "custom", from: "2026-09-02", to: "2026-09-30" }, { timeZone: "Asia/Kolkata" });
    const find = (range: typeof sept1) => withSchool(principal.ctx, (tx) => tx.enquiry.findMany({ where: enquiryWhere(params, principal.v, { yearId: t.nextYearId, timeZone: "Asia/Kolkata", range }), select: { id: true } }));
    expect((await find(sept1)).map((e) => e.id)).toEqual([old.id]);
    expect((await find(sept2)).map((e) => e.id)).not.toContain(old.id);
    expect((await find(null)).length).toBeGreaterThan(1);
  });
});

describe("the consent code (D8a)", () => {
  const purpose = "test:consent";
  const phone = "9988776655";
  let code = "";
  const deliver = async (_: string, text: string) => { code = /\d{6}/.exec(text)![0]; return true; };

  it("counts a wrong code even though the check does not throw, and checking does not use the code up", async () => {
    await withSchool(principal.ctx, (tx) => startOtp(tx, principal.ctx, { phone, purpose, schoolName: "Test", about: null }, { deliver }));
    const wrong = code === "000000" ? "111111" : "000000";
    const r = await withSchool(principal.ctx, (tx) => tryOtp(tx, { purpose, phone, code: wrong }));
    expect(r.ok).toBe(false);
    const row = await withSchool(principal.ctx, (tx) => tx.admissionOtp.findFirst({ where: { purpose, usedAt: null } }));
    expect(row?.attempts).toBe(1);
    expect((await withSchool(principal.ctx, (tx) => tryOtp(tx, { purpose, phone, code }, new Date(), false))).ok).toBe(true);
    expect((await withSchool(principal.ctx, (tx) => tryOtp(tx, { purpose, phone, code }, new Date(), false))).ok).toBe(true);
    await withSchool(principal.ctx, (tx) => verifyOtp(tx, { purpose, phone, code }));
    await expect(withSchool(principal.ctx, (tx) => verifyOtp(tx, { purpose, phone, code }))).rejects.toThrow(/No code is waiting/);
  });

  it("stops after too many wrong codes, even with the right one", async () => {
    await withSchool(principal.ctx, (tx) => startOtp(tx, principal.ctx, { phone, purpose, schoolName: "Test", about: null }, { deliver }));
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < OTP_MAX_TRIES; i++) await withSchool(principal.ctx, (tx) => tryOtp(tx, { purpose, phone, code: wrong }));
    const r = await withSchool(principal.ctx, (tx) => tryOtp(tx, { purpose, phone, code }));
    expect(r).toEqual({ ok: false, message: "Too many wrong codes. Send a new code." });
  });

  it("says the school has no SMS set up, not that the parent's number is wrong (QA PEOPLE-05)", async () => {
    // The test school has no messaging channel switched on.
    await expect(withSchool(principal.ctx, (tx) => startOtp(tx, principal.ctx, { phone: "9988776644", purpose: "test:no-channel", schoolName: "Test", about: null })))
      .rejects.toThrow("The code could not be sent. No messaging channel is set up (Settings, SMS, WhatsApp & Email).");
  });

  it("tells a parent on the online form plainly, with no staff words or settings path (QA ADMIT-03)", async () => {
    await expect(withSchool(principal.ctx, (tx) => startOtp(tx, principal.ctx, { phone: "9988776643", purpose: "test:no-channel-parent", schoolName: "Test", about: null }, { forParent: true })))
      .rejects.toThrow(/^We could not send the code just now\. Please contact the school office\.$/);
  });

  it("refuses an expired code", async () => {
    await withSchool(principal.ctx, (tx) => startOtp(tx, principal.ctx, { phone, purpose, schoolName: "Test", about: null }, { deliver }));
    const later = new Date(Date.now() + 11 * 60_000);
    expect((await withSchool(principal.ctx, (tx) => tryOtp(tx, { purpose, phone, code }, later))).ok).toBe(false);
  });
});

describe("the online application form", () => {
  it("saves an application as Submitted online with consent, makes an enquiry, and gives the parent a private status link", async () => {
    await withSchool(principal.ctx, async (tx) => {
      const s = await loadSettings(tx, principal.ctx);
      await saveRules(tx, principal.ctx, principal.v, { admissionYearId: t.nextYearId, applicationPrefix: s.applicationPrefix, allowOverCapacity: false, admitWithPapersPending: false, waitingListOn: true, siblingPriorityOn: false, siblingWeight: 20, quotaOn: false, quotas: [], onlineOn: true, applicationFeeOn: false, offerLettersOn: false, campaignsOn: false });
    });
    const input = applicationInput(t.nextYearId, t.c1, { phone: "9876543219" }) as ApplicationInput;
    let code = "";
    await withSchool({ schoolId: t.school.id, userId: null }, (tx) => startOtp(tx, { schoolId: t.school.id, userId: null }, { phone: input.phone, purpose: `online:${input.phone}`, schoolName: "Test", about: null }, { deliver: async (_, text) => { code = /\d{6}/.exec(text)![0]; return true; } }));
    await expect(submitOnline(t.school.id, { ...input, consentTypes: ["data-processing"], givenByName: "Father", code: code === "000000" ? "111111" : "000000", heardFrom: null }, "203.0.113.9")).rejects.toThrow(/not right/);
    const r = await submitOnline(t.school.id, { ...input, consentTypes: ["data-processing"], givenByName: "Father", code, heardFrom: null }, "203.0.113.9");
    const app = await withSchool(principal.ctx, (tx) => tx.application.findUniqueOrThrow({ where: { id: r.id }, include: { consents: true } }));
    expect(app.stage).toBe("SUBMITTED_ONLINE");
    expect(app.enquiryId).not.toBeNull();
    expect(app.consents.map((c) => c.consentType)).toContain("data-processing");
    expect(checkStatusToken(t.school.id, r.id, r.token)).toBe(true);
    expect(checkStatusToken(t.school.id, r.id, statusToken(t.school.id, "00000000-0000-0000-0000-000000000000"))).toBe(false);
    expect(checkStatusToken(t.school.id, r.id, "")).toBe(false);
    expect((await applicationStatus(t.school.id, r.id))?.applicationNo).toBe(app.applicationNo);
  });

  it("marks the previous school as needed on the form for the classes the send asks it for (APPLY-02)", async () => {
    const form = await publicForm(t.school.id);
    const byId = new Map(form.classes.map((c) => [c.id, c]));
    expect(byId.get(t.c1)).toMatchObject({ previousSchoolNeeded: false });
    expect(byId.get(t.c2)).toMatchObject({ previousSchool: true, previousSchoolNeeded: true });
    const input = applicationInput(t.nextYearId, t.c2, { previousSchool: null }) as ApplicationInput;
    await expect(withSchool(principal.ctx, (tx) => createApplication(tx, principal.ctx, principal.v, principal.s, input, { campusId: t.campusId, channel: "counter" }))).rejects.toThrow(/For Class 2, give the previous school/);
  });

  it("refuses without data consent", async () => {
    const input = applicationInput(t.nextYearId, t.c2, { phone: "9876543218" }) as ApplicationInput;
    await expect(submitOnline(t.school.id, { ...input, consentTypes: ["photo"], givenByName: "Father", code: "123456", heardFrom: null }, "203.0.113.10")).rejects.toThrow(/agree to the use of your child's data/);
  });

  it("filters applications by the day submitted", async () => {
    const params = readListParams({}, ["stage"]);
    const today = periodFromSearch({ period: "today" }, { timeZone: "Asia/Kolkata" });
    const longAgo = periodFromSearch({ period: "custom", from: "2020-01-01", to: "2020-01-31" }, { timeZone: "Asia/Kolkata" });
    const count = (range: typeof today) => withSchool(principal.ctx, (tx) => tx.application.count({ where: applicationWhere(params, { yearId: t.nextYearId, range, timeZone: "Asia/Kolkata" }) }));
    expect(await count(today)).toBeGreaterThan(0);
    expect(await count(longAgo)).toBe(0);
  });
});

describe("the application fee link", () => {
  it("is refused while Razorpay is not set up, so no link is sent", async () => {
    const app = await withSchool(principal.ctx, async (tx) => {
      const a = await createApplication(tx, principal.ctx, principal.v, principal.s, applicationInput(t.nextYearId, t.c1) as ApplicationInput, { campusId: t.campusId, channel: "counter" });
      await tx.application.update({ where: { id: a.id }, data: { feeDuePaise: BigInt(50000) } });
      return a;
    });
    await expect(withSchool(principal.ctx, (tx) => sendFeeLink(tx, principal.ctx, principal.v, app.id))).rejects.toThrow(/Online payment is not set up/);
  });
});

describe("Admission Settings", () => {
  it("keeps the statuses the system sets, archives instead of dropping, and logs every change", async () => {
    await withSchool(principal.ctx, async (tx) => {
      const s = await loadSettings(tx, principal.ctx);
      const before = await tx.auditLogEntry.count({ where: { recordType: "Admission Settings" } });
      await saveList(tx, principal.ctx, principal.v, "sources", [...s.sourceList.filter((x) => x.key !== "referral").map((x) => ({ key: x.key, label: x.label, archived: false })), { key: null, label: "Newspaper ad", archived: false }]);
      const after = await loadSettings(tx, principal.ctx);
      expect(after.sourceList.find((x) => x.key === "referral")?.archived).toBe(true);
      expect(after.sourceList.some((x) => x.label === "Newspaper ad" && !x.archived)).toBe(true);
      await saveList(tx, principal.ctx, principal.v, "enquiryStatuses", s.statusList.filter((x) => x.key !== "applied").map((x) => ({ key: x.key, label: x.label, archived: x.key === "admitted" })));
      const statuses = await loadSettings(tx, principal.ctx);
      expect(statuses.statusList.find((x) => x.key === "applied")?.archived).toBeFalsy();
      expect(statuses.statusList.find((x) => x.key === "admitted")?.archived).toBeFalsy();
      expect(await tx.auditLogEntry.count({ where: { recordType: "Admission Settings" } })).toBeGreaterThan(before);
    });
  });
});

describe("Admission Reports", () => {
  it("count only what was added in the chosen dates", async () => {
    const all = await withSchool(principal.ctx, async (tx) => report(tx, principal.s, principal.v, "pipeline", { yearId: t.nextYearId }, await names(tx)));
    const sept = await withSchool(principal.ctx, async (tx) => report(tx, principal.s, principal.v, "pipeline", { yearId: t.nextYearId, created: { gte: day("2026-09-01"), lt: day("2026-09-02") } }, await names(tx)));
    const total = (r: typeof all) => r.rows.reduce((p, x) => p + Number(x.total), 0);
    expect(total(sept)).toBe(1);
    expect(total(all)).toBeGreaterThan(total(sept));
  });

  it("show the Receptionist only their own enquiries", async () => {
    const r = await withSchool(frontdesk.ctx, async (tx) => report(tx, frontdesk.s, frontdesk.v, "pipeline", { yearId: t.nextYearId }, await names(tx)));
    expect(r.rows.reduce((p, x) => p + Number(x.total), 0)).toBe(1);
  });
});
