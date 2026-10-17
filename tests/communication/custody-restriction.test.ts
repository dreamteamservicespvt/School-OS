// Custody / access restriction outside pickup (03 §2; 11 Parent Link; rule
// 31): a father with a restriction on Ravi, and none on Ravi's sister Sita.
// Through the Parent Link page's own loaders and the guardian's server
// actions and downloads, he never sees, pays for, downloads receipts of,
// consents for or books for Ravi, and none of Ravi's messages reach him,
// while everything for Sita works as before. The office still sees the
// restriction. Then the school's Parent Link switches are checked by every
// action, not only when the page is drawn.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined), set: (name: string, value: string) => { jar.set(name, value); }, delete: (name: string) => { jar.delete(name); } }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { withSchool } from "@/lib/db";
import { confirmDevice, createLink, deviceCookieName, hashToken, newDeviceKey, sendCode, tokenFor } from "@/lib/parent-link/links";
import { loadGuardianView } from "@/lib/parent-link/view";
import { loadSections } from "@/lib/parent-link/render";
import { pickupList, setRestriction } from "@/lib/students/guardians";
import { childrenOfGuardian } from "@/lib/students/guardian-access";
import { sendMessage } from "@/lib/messaging/send";
import { resolveAudience, SYSTEM_SCOPE } from "@/lib/messaging/recipients";
import { updateSettings } from "@/lib/messaging/settings";
import { audienceGuardianIds } from "@/lib/communication/notices";
import { childrenByGuardian } from "@/lib/communication/parent-link-admin";
import { receiptForGuardian } from "@/lib/fees/parent-link";
import { payFees } from "@/app/p/[token]/fee-actions";
import { askConsent, sendDeviceCode } from "@/app/p/[token]/actions";
import { askEventConsent, declineEvent } from "@/app/p/[token]/event-actions";
import { bookPtmSlot } from "@/app/p/[token]/ptm-actions";
import { GET as receiptRoute } from "@/app/p/[token]/fees/[paymentId]/route";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "../fees/fixture";

let f: FeeSchool;
let fatherId = "";
let motherId = "";
let token = "";
let linkId = "";
let consentTextId = "";
let eventId = "";
const pay: { ravi: string; sita: string } = { ravi: "", sita: "" };

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const phone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

async function confirmPhone(id: string) {
  const key = newDeviceKey();
  await withSchool(f.ctx, (tx) => sendCode(tx, f.ctx, id, "device", { keyHash: hashToken(key) }));
  const code = await withSchool(f.ctx, async (tx) => {
    const c = await tx.parentLinkCode.findFirstOrThrow({ where: { parentLinkId: id }, orderBy: { createdAt: "desc" } });
    const r = await tx.messageRecipient.findFirstOrThrow({ where: { messageId: c.messageId! } });
    return r.text.match(/\b(\d{6})\b/)![1];
  });
  const r = await withSchool(f.ctx, (tx) => confirmDevice(tx, f.ctx, id, key, code, { userAgent: "test", ipAddress: null }));
  expect(r.ok).toBe(true);
  return key;
}

const receipt = (paymentId: string) => receiptRoute(new Request(`http://localhost/p/${token}/fees/${paymentId}`), { params: Promise.resolve({ token, paymentId }) });
const recipientsOf = (messageId: string) => withSchool(f.ctx, async (tx) => (await tx.messageRecipient.findMany({ where: { messageId }, select: { name: true } })).map((r) => r.name).sort());

beforeAll(async () => {
  f = await makeFeeSchool();
  fatherId = f.ravi.guardian.id; // Srinivas Kumar
  await withSchool(f.ctx, async (tx) => {
    const mother = await tx.guardian.create({ data: { schoolId: f.school.id, name: "Lakshmi Kumar", relationship: "Mother", phone: phone(), language: "en" } });
    motherId = mother.id;
    await tx.studentGuardian.create({ data: { schoolId: f.school.id, studentId: f.ravi.id, guardianId: mother.id, relationship: "Mother", emergencyOrder: 2 } });
    // Srinivas is Sita's father too; no restriction there.
    await tx.studentGuardian.create({ data: { schoolId: f.school.id, studentId: f.sita.id, guardianId: fatherId, relationship: "Father" } });
    const ravisLink = await tx.studentGuardian.findFirstOrThrow({ where: { studentId: f.ravi.id, guardianId: fatherId } });
    await setRestriction(tx, f.pctx, ravisLink.id, "Court order dated 03-02-2026; mother has custody.", "Court order received by the office");
    await tx.paymentGatewayAccount.create({ data: { schoolId: f.school.id, displayName: "Razorpay test", provider: "razorpay", environment: "test", isActive: true, secretsEnc: "unused-in-this-test" } });
    consentTextId = (await tx.consentText.create({ data: { schoolId: f.school.id, consentType: "photo", title: "Photo consent", version: 1, text: { en: "We may use photos of your child." } } })).id;
    const future = new Date(Date.now() + 20 * 86_400_000);
    eventId = (await tx.event.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, number: `EV-${randomUUID().slice(0, 6)}`, name: "Zoo trip", type: "trip", date: new Date(Date.UTC(future.getUTCFullYear(), future.getUTCMonth(), future.getUTCDate())), startMin: 540, audienceLabel: "Whole school", consentOn: true, registrationOn: true } })).id;
    const link = await createLink(tx, f.ctx, fatherId);
    linkId = link.id;
  });
  token = tokenFor(linkId);
  jar.set(deviceCookieName(linkId), await confirmPhone(linkId));
  for (const s of [f.ravi, f.sita] as const) {
    const [d] = await dues(f.ctx, s.id);
    await collect(f.ctx, { studentId: s.id, dueIds: [d.id], amountPaise: R(1000) });
  }
  await withSchool(f.ctx, async (tx) => {
    pay.ravi = (await tx.payment.findFirstOrThrow({ where: { studentId: f.ravi.id } })).id;
    pay.sita = (await tx.payment.findFirstOrThrow({ where: { studentId: f.sita.id } })).id;
  });
});

describe("a guardian with a custody restriction on one child", () => {
  it("does not see that child on Parent Link, even from the address; the brother or sister is shown", async () => {
    const out = await withSchool(f.ctx, async (tx) => {
      const view = await loadGuardianView(tx, f.ctx, { linkId, guardianId: fatherId, childId: f.ravi.id, token, preview: false });
      return { view, sections: view ? await loadSections(tx, f.ctx, view) : [] };
    });
    expect(out.view!.children.map((c) => c.id)).toEqual([f.sita.id]);
    expect(out.view!.child.id).toBe(f.sita.id);
    const fees = out.sections.find((x) => x.def.key === "fees")?.data as { studentId: string } | undefined;
    expect(fees?.studentId).toBe(f.sita.id);
    expect(JSON.stringify(out.sections.map((x) => x.data), (_k, v) => (typeof v === "bigint" ? String(v) : v))).not.toContain(f.ravi.id);
    // The mother, who has custody, still sees Ravi.
    const mothers = await withSchool(f.ctx, (tx) => loadGuardianView(tx, f.ctx, { linkId, guardianId: motherId, childId: f.ravi.id, token: "", preview: true }));
    expect(mothers!.child.id).toBe(f.ravi.id);
    expect(await withSchool(f.ctx, (tx) => childrenOfGuardian(tx, f.ctx, fatherId))).toEqual([f.sita.id]);
  });

  it("cannot pay for that child; Pay for the other child goes to the payment page", async () => {
    const [raviDue] = await dues(f.ctx, f.ravi.id);
    const [sitaDue] = await dues(f.ctx, f.sita.id);
    expect(await payFees(token, null, form({ studentId: f.ravi.id, dueId: raviDue.id }))).toEqual({ ok: false, message: "This student is not linked to you." });
    expect(await withSchool(f.ctx, (tx) => tx.paymentLink.count({ where: { studentId: f.ravi.id } }))).toBe(0);
    await expect(payFees(token, null, form({ studentId: f.sita.id, dueId: sitaDue.id }))).rejects.toThrow(/^REDIRECT \/pay\//);
  });

  it("cannot download that child's receipts or tax invoices", async () => {
    const r = await receipt(pay.ravi);
    expect(r.status).toBe(404);
    expect(await r.text()).toMatch(/not linked to you/);
    const doc = await withSchool(f.ctx, (tx) => receiptForGuardian(tx, f.ctx, fatherId, pay.sita));
    expect(doc.fileName).toBeTruthy();
  });

  it("cannot give consent for that child; can for the other", async () => {
    expect(await askConsent(token, null, form({ studentId: f.ravi.id, consentTextId, action: "give" }))).toEqual({ ok: false, message: "Choose your child for this consent." });
    expect(await askConsent(token, null, form({ studentId: f.sita.id, consentTextId, action: "give" }))).toEqual(expect.objectContaining({ ok: true, step: "code" }));
  });

  it("cannot answer an event's consent for that child; can for the other", async () => {
    expect(await askEventConsent(token, null, form({ eventId, studentId: f.ravi.id }))).toEqual({ ok: false, message: "Choose your child." });
    expect(await declineEvent(token, null, form({ eventId, studentId: f.ravi.id }))).toEqual({ ok: false, message: "Choose your child." });
    expect(await declineEvent(token, null, form({ eventId, studentId: f.sita.id }))).toEqual(expect.objectContaining({ ok: true, step: "done" }));
    const answers = await withSchool(f.ctx, (tx) => tx.eventConsent.findMany({ where: { eventId }, select: { studentId: true, answer: true } }));
    expect(answers).toEqual([{ studentId: f.sita.id, answer: "DECLINED" }]);
  });

  it("cannot book a PTM for that child; for the other the booking goes on to the slot checks", async () => {
    const slotId = randomUUID();
    expect(await bookPtmSlot(token, null, form({ slotId, studentId: f.ravi.id }))).toEqual({ ok: false, message: "This child is not on your Parent Link." });
    expect(await bookPtmSlot(token, null, form({ slotId, studentId: f.sita.id }))).toEqual({ ok: false, message: expect.stringMatching(/cancelled or changed/) });
  });

  it("gets none of that child's messages; the other child's messages still reach them", async () => {
    const both = await withSchool(f.ctx, (tx) => sendMessage(tx, f.ctx, { to: { guardiansOf: [f.ravi.id], allGuardians: true }, channels: ["whatsapp"], text: "Ravi was absent today." }));
    expect(await recipientsOf(both.messageId)).toEqual(["Lakshmi Kumar"]);
    // The main contact moved to the mother when the restriction was set.
    const main = await withSchool(f.ctx, (tx) => sendMessage(tx, f.ctx, { to: { guardiansOf: [f.ravi.id] }, channels: ["whatsapp"], text: "Fees reminder for Ravi." }));
    expect(await recipientsOf(main.messageId)).toEqual(["Lakshmi Kumar"]);
    const sita = await withSchool(f.ctx, (tx) => sendMessage(tx, f.ctx, { to: { guardiansOf: [f.sita.id], allGuardians: true }, channels: ["whatsapp"], text: "Sita was absent today." }));
    expect(await recipientsOf(sita.messageId)).toEqual(["Mohan Rao", "Srinivas Kumar"]);
    // Chosen one by one, he is still a parent the office may write to, but only as Sita's.
    const chosen = await withSchool(f.ctx, (tx) => resolveAudience(tx, f.ctx, { guardianIds: [fatherId] }, SYSTEM_SCOPE));
    expect(chosen.find((c) => c.id === fatherId)!.students.map((s) => s.id)).toEqual([f.sita.id]);
    // A notice to Ravi's class counts him only through Sita.
    const ids = await withSchool(f.ctx, (tx) => audienceGuardianIds(tx, f.ctx, { parents: true, students: false, staff: false, roleKeys: [], classIds: [], sectionIds: [f.a.id], campusIds: [] }));
    expect(ids).toContain(motherId);
    expect(ids).toContain(fatherId);
  });

  it("is still shown to the office, marked, on the pickup list and the Parent Link page", async () => {
    const out = await withSchool(f.ctx, async (tx) => ({ pickup: await pickupList(tx, f.ravi.id), kids: await childrenByGuardian(tx, f.ctx, [fatherId]) }));
    expect(out.pickup.restricted.map((r) => r.guardianId)).toEqual([fatherId]);
    expect(out.pickup.allowed.map((a) => a.guardianId)).not.toContain(fatherId);
    expect(out.kids.get(fatherId)!.map((k) => [k.id, k.restricted]).sort()).toEqual([[f.ravi.id, true], [f.sita.id, false]].sort());
  });
});

describe("the school's Parent Link switches, on every action", () => {
  const shows = (key: string, on: boolean) => withSchool(f.pctx, (tx) => updateSettings(tx, f.pctx, (v) => ({ ...v, parentLink: { ...v.parentLink, shows: { ...v.parentLink.shows, [key]: on } } })));

  it("refuses Pay and receipts while Fees is switched off", async () => {
    await shows("fees", false);
    const [sitaDue] = await dues(f.ctx, f.sita.id);
    expect(await payFees(token, null, form({ studentId: f.sita.id, dueId: sitaDue.id }))).toEqual({ ok: false, message: expect.stringMatching(/switched this part of Parent Link off/) });
    const r = await receipt(pay.sita);
    expect(r.status).toBe(403);
    expect(await r.text()).toMatch(/switched this part of Parent Link off/);
    await shows("fees", true);
  });

  it("refuses consent while Consent forms is off, and PTM booking and event answers while Events is off", async () => {
    await shows("consent", false);
    expect(await askConsent(token, null, form({ studentId: f.sita.id, consentTextId, action: "give" }))).toEqual({ ok: false, message: expect.stringMatching(/switched this part of Parent Link off/) });
    await shows("consent", true);
    await shows("events", false);
    expect(await bookPtmSlot(token, null, form({ slotId: randomUUID(), studentId: f.sita.id }))).toEqual({ ok: false, message: expect.stringMatching(/switched this part of Parent Link off/) });
    expect(await askEventConsent(token, null, form({ eventId, studentId: f.sita.id }))).toEqual({ ok: false, message: expect.stringMatching(/switched this part of Parent Link off/) });
    await shows("events", true);
  });

  it("refuses every action, and sends no code, while Parent Link is off or the school is suspended", async () => {
    const [sitaDue] = await dues(f.ctx, f.sita.id);
    await withSchool(f.pctx, (tx) => updateSettings(tx, f.pctx, (v) => ({ ...v, parentLink: { ...v.parentLink, on: false } })));
    const before = await withSchool(f.ctx, (tx) => tx.parentLinkCode.count({ where: { parentLinkId: linkId } }));
    expect(await payFees(token, null, form({ studentId: f.sita.id, dueId: sitaDue.id }))).toEqual({ ok: false, message: expect.stringMatching(/switched off Parent Link/) });
    expect(await sendDeviceCode(token, null, form({}))).toEqual({ ok: false, message: expect.stringMatching(/switched off Parent Link/) });
    expect(await withSchool(f.ctx, (tx) => tx.parentLinkCode.count({ where: { parentLinkId: linkId } }))).toBe(before);
    await withSchool(f.pctx, (tx) => updateSettings(tx, f.pctx, (v) => ({ ...v, parentLink: { ...v.parentLink, on: true } })));

    await withSchool(f.pctx, (tx) => tx.school.update({ where: { id: f.school.id }, data: { status: "SUSPENDED" } }));
    expect(await declineEvent(token, null, form({ eventId, studentId: f.sita.id }))).toEqual({ ok: false, message: expect.stringMatching(/switched off Parent Link/) });
    await withSchool(f.pctx, (tx) => tx.school.update({ where: { id: f.school.id }, data: { status: "ACTIVE" } }));
    await expect(payFees(token, null, form({ studentId: f.sita.id, dueId: sitaDue.id }))).rejects.toThrow(/^REDIRECT \/pay\//);
  });
});
