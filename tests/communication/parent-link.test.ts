// Parent Link (11-communication.md; rule 31): the token is stored hashed
// only, a new phone needs a one-time code, revoke stops the link at once,
// and a guardian sees only their own children.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import {
  checkCode, confirmDevice, confirmedDevice, createAndSend, createLink, findLink, hashToken, newDeviceKey, openLink, reissueLink, revokeLink, sendCode, tokenFor, withHiddenLinks, withRealLinks, CODE_TRIES,
} from "@/lib/parent-link/links";
import { askConsentCode, confirmConsent, requestConsent, requestStatus } from "@/lib/parent-link/consent";
import { loadGuardianView } from "@/lib/parent-link/view";
import { loadSections } from "@/lib/parent-link/render";
import { saveNotice } from "@/lib/communication/notices";
import { makeCommSchool } from "./fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
const device = { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120", ipAddress: "10.0.0.1" };

beforeAll(async () => {
  s = await makeCommSchool();
});

/** The code as the sandbox shows it in the message log. */
async function lastCode(linkId: string) {
  return withSchool(s.ctx, async (tx) => {
    const code = await tx.parentLinkCode.findFirstOrThrow({ where: { parentLinkId: linkId }, orderBy: { createdAt: "desc" } });
    const r = await tx.messageRecipient.findFirstOrThrow({ where: { messageId: code.messageId! } });
    return r.text.match(/\b(\d{6})\b/)![1];
  });
}

async function confirmPhone(linkId: string) {
  const key = newDeviceKey();
  await withSchool(s.ctx, (tx) => sendCode(tx, s.ctx, linkId, "device", { keyHash: hashToken(key) }));
  const code = await lastCode(linkId);
  const r = await withSchool(s.ctx, (tx) => confirmDevice(tx, s.ctx, linkId, key, code, device));
  expect(r.ok).toBe(true);
  return key;
}

describe("the link and its token", () => {
  it("stores only a hash of the token, and message texts keep a placeholder", async () => {
    const link = await withSchool(s.ctx, (tx) => createAndSend(tx, s.ctx, s.father.id));
    const token = tokenFor(link.id);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(link.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(link)).not.toContain(token);
    const rec = await withSchool(s.ctx, (tx) => tx.messageRecipient.findFirstOrThrow({ where: { guardianId: s.father.id, message: { sourceType: "Parent Link", sourceId: link.id } } }));
    expect(rec.text).not.toContain(token);
    expect(withRealLinks(rec.text)).toContain(`/p/${token}`);
    expect(withHiddenLinks(rec.text)).toContain("[personal Parent Link]");
    // Found from the token alone, without a school chosen.
    expect(await findLink(token)).toEqual({ linkId: link.id, schoolId: s.school.id });
    expect(await findLink(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(await findLink("short")).toBeNull();
  });

  it("allows one active link per guardian", async () => {
    await expect(withSchool(s.ctx, (tx) => createLink(tx, s.ctx, s.father.id))).rejects.toThrow(/already has an active Parent Link/);
  });
});

describe("a new phone", () => {
  it("needs a one-time code before anything is shown, then opens straight away", async () => {
    const link = await withSchool(s.ctx, (tx) => createLink(tx, s.ctx, s.mother.id));
    const token = tokenFor(link.id);
    const first = await openLink(token, null, device);
    expect(first.state).toBe("verify");
    if (first.state === "verify") expect(first.maskedPhone).toMatch(/^\+91 ••••• ••\d{3}$/);

    const key = await confirmPhone(link.id);
    const again = await openLink(token, key, device);
    expect(again.state).toBe("open");
    // Another phone (another key) still needs a code.
    expect((await openLink(token, newDeviceKey(), device)).state).toBe("verify");
    const opened = await withSchool(s.ctx, (tx) => tx.auditLogEntry.count({ where: { recordType: "Parent Link", recordId: link.id, action: "opened" } }));
    expect(opened).toBe(1);
  });

  it("stops a code after five wrong tries, and a code is tied to the phone it was sent for", async () => {
    const link = await withSchool(s.ctx, (tx) => createLink(tx, s.ctx, s.teluguMother.id));
    const key = newDeviceKey();
    await withSchool(s.ctx, (tx) => sendCode(tx, s.ctx, link.id, "device", { keyHash: hashToken(key) }));
    const code = await lastCode(link.id);
    // Right code, other phone: refused.
    const other = await withSchool(s.ctx, (tx) => confirmDevice(tx, s.ctx, link.id, newDeviceKey(), code, device));
    expect(other.ok).toBe(false);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < CODE_TRIES; i++) {
      const r = await withSchool(s.ctx, (tx) => checkCode(tx, s.ctx, link.id, "device", wrong, hashToken(key)));
      expect(r.ok).toBe(false);
    }
    const late = await withSchool(s.ctx, (tx) => confirmDevice(tx, s.ctx, link.id, key, code, device));
    expect(late).toEqual({ ok: false, message: expect.stringMatching(/Too many wrong codes/) });
  });

  it("refuses an expired code", async () => {
    const link = await withSchool(s.ctx, (tx) => createLink(tx, s.ctx, s.otherFather.id));
    const key = newDeviceKey();
    await withSchool(s.ctx, (tx) => sendCode(tx, s.ctx, link.id, "device", { keyHash: hashToken(key) }));
    const code = await lastCode(link.id);
    const later = new Date(Date.now() + 11 * 60_000);
    const r = await withSchool(s.ctx, (tx) => confirmDevice(tx, s.ctx, link.id, key, code, device, later));
    expect(r).toEqual({ ok: false, message: expect.stringMatching(/expired/) });
  });
});

describe("revoke and reissue", () => {
  it("stops a revoked link at once on every phone, and the reissued link needs a new code", async () => {
    const link = await withSchool(s.ctx, (tx) => tx.parentLink.findFirstOrThrow({ where: { guardianId: s.mother.id, status: "ACTIVE" } }));
    const oldToken = tokenFor(link.id);
    const key = await confirmPhone(link.id);
    expect((await openLink(oldToken, key, device)).state).toBe("open");

    const fresh = await withSchool(s.ctx, (tx) => reissueLink(tx, s.ctx, link.id, "Lost phone"));
    expect((await openLink(oldToken, key, device)).state).toBe("revoked");
    expect(await withSchool(s.ctx, (tx) => confirmedDevice(tx, link.id, key))).toBeNull();
    const newToken = tokenFor(fresh.id);
    expect((await openLink(newToken, key, device)).state).toBe("verify");
    const key2 = await confirmPhone(fresh.id);
    expect((await openLink(newToken, key2, device)).state).toBe("open");
    const log = await withSchool(s.ctx, (tx) => tx.auditLogEntry.findMany({ where: { recordType: "Parent Link", recordId: { in: [link.id, fresh.id] } }, select: { action: true } }));
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["revoked", "reissued", "opened", "phone-confirmed"]));
  });

  it("will not revoke twice", async () => {
    const link = await withSchool(s.ctx, (tx) => tx.parentLink.findFirstOrThrow({ where: { guardianId: s.mother.id, status: "REVOKED" } }));
    await expect(withSchool(s.ctx, (tx) => revokeLink(tx, s.ctx, link.id, "Other reason"))).rejects.toThrow(/already revoked/);
  });
});

describe("only the guardian's own children", () => {
  it("shows both children of a family and ignores another family's child in the address", async () => {
    const link = await withSchool(s.ctx, (tx) => tx.parentLink.findFirstOrThrow({ where: { guardianId: s.father.id, status: "ACTIVE" } }));
    const view = await withSchool(s.ctx, (tx) => loadGuardianView(tx, s.ctx, { linkId: link.id, guardianId: s.father.id, childId: s.kiran.id, token: "", preview: true }));
    expect(view!.children.map((c) => c.name)).toEqual(["Ravi Kumar", "Sita Kumar"]);
    expect(view!.child.id).toBe(s.ravi.id);
    const sita = await withSchool(s.ctx, (tx) => loadGuardianView(tx, s.ctx, { linkId: link.id, guardianId: s.father.id, childId: s.sita.id, token: "", preview: true }));
    expect(sita!.child.name).toBe("Sita Kumar");
    expect(sita!.child.classLabel).toBe("Class 5 B");
  });

  it("shows notices for the chosen child's section only, critical ones pinned, and counts the guardian as having seen them", async () => {
    const base = { body: "Body text for the notice.", attachmentFileIds: [], priority: "NORMAL" as const, channels: ["board", "parent-link"] as ("board" | "parent-link")[], publishAt: null, expiresOn: null, askAck: false };
    const audience = (sectionIds: string[]) => ({ parents: true, students: false, staff: false, roleKeys: [], classIds: [], sectionIds, campusIds: [] });
    await withSchool(s.ctx, async (tx) => {
      await saveNotice(tx, s.ctx, { ...base, title: "Only 5 B", audience: audience([s.b.id]) }, { action: "publish", fullAccess: true, criticalConfirmed: false });
      await saveNotice(tx, s.ctx, { ...base, title: "Only 5 A", audience: audience([s.a.id]) }, { action: "publish", fullAccess: true, criticalConfirmed: false });
      await saveNotice(tx, s.ctx, { ...base, title: "School closed tomorrow", priority: "CRITICAL", audience: audience([]) }, { action: "publish", fullAccess: true, criticalConfirmed: true });
    });
    const link = await withSchool(s.ctx, (tx) => tx.parentLink.findFirstOrThrow({ where: { guardianId: s.father.id, status: "ACTIVE" } }));
    const sections = await withSchool(s.ctx, async (tx) => {
      const view = await loadGuardianView(tx, s.ctx, { linkId: link.id, guardianId: s.father.id, childId: s.ravi.id, token: "t", preview: false });
      return loadSections(tx, s.ctx, view!);
    });
    const keys = sections.map((x) => x.def.key);
    expect(keys[0]).toBe("notices-critical");
    const list = sections.find((x) => x.def.key === "notices")!.data as { title: string }[];
    expect(list.map((n) => n.title)).toEqual(["Only 5 A"]);
    const seen = await withSchool(s.ctx, (tx) => tx.noticeGuardianView.count({ where: { guardianId: s.father.id } }));
    expect(seen).toBe(2);
  });
});

describe("consent", () => {
  it("records consent with a code and the text version, only for the guardian's own children", async () => {
    const text = await withSchool(s.ctx, (tx) => tx.consentText.create({ data: { schoolId: s.school.id, consentType: "photo", title: "Photo consent", version: 1, text: { en: "We may use photos of your child in school publications." } } }));
    const link = await withSchool(s.ctx, (tx) => tx.parentLink.findFirstOrThrow({ where: { guardianId: s.father.id, status: "ACTIVE" } }));
    await expect(withSchool(s.ctx, (tx) => askConsentCode(tx, s.ctx, link.id, s.father.id, { consentTextId: text.id, studentIds: [s.kiran.id], action: "give" }))).rejects.toThrow(/Choose your child/);

    const req = await withSchool(s.ctx, (tx) => requestConsent(tx, s.ctx, { consentTextId: text.id, guardianIds: [s.father.id, s.otherFather.id], audienceLabel: "Class 5", replyBy: new Date(Date.now() + 14 * 86400_000) }));
    await withSchool(s.ctx, (tx) => askConsentCode(tx, s.ctx, link.id, s.father.id, { consentTextId: text.id, studentIds: [s.ravi.id, s.sita.id], action: "give" }));
    const code = await lastCode(link.id);
    const wrong = await withSchool(s.ctx, (tx) => confirmConsent(tx, s.ctx, link.id, s.father.id, code === "123456" ? "654321" : "123456", device));
    expect(wrong.ok).toBe(false);
    const ok = await withSchool(s.ctx, (tx) => confirmConsent(tx, s.ctx, link.id, s.father.id, code, device));
    expect(ok).toEqual(expect.objectContaining({ ok: true, count: 2 }));
    const recs = await withSchool(s.ctx, (tx) => tx.consentRecord.findMany({ where: { guardianId: s.father.id, consentType: "photo" } }));
    expect(recs).toHaveLength(2);
    expect(recs.every((r) => r.textVersion === 1 && r.how === "parent-link" && !r.withdrawnAt)).toBe(true);
    const status = await withSchool(s.ctx, (tx) => requestStatus(tx, s.ctx, req.request.id));
    expect(status.given).toEqual([s.father.id]);
    expect(status.waiting).toEqual([s.otherFather.id]);

    // Withdrawing keeps the record, with its date.
    await withSchool(s.ctx, (tx) => askConsentCode(tx, s.ctx, link.id, s.father.id, { consentTextId: text.id, studentIds: [s.ravi.id], action: "withdraw" }));
    const code2 = await lastCode(link.id);
    await withSchool(s.ctx, (tx) => confirmConsent(tx, s.ctx, link.id, s.father.id, code2, device));
    const after = await withSchool(s.ctx, (tx) => tx.consentRecord.findMany({ where: { guardianId: s.father.id, consentType: "photo" } }));
    expect(after).toHaveLength(2);
    expect(after.filter((r) => r.withdrawnAt)).toHaveLength(1);
  });
});
