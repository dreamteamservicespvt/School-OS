// File links that expire, the file route, the document vault and School Profile rules.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { FILE_LINK_MS, checkFileLink, fileLink } from "@/lib/files";
import { GET } from "@/app/api/v1/files/[id]/route";
import { checkGstin } from "@/lib/settings/profile-rules";
import { addCampus, archiveCampus, makeMainCampus, saveBoard } from "@/lib/settings/school-profile";
import { expiryState, remindExpiringDocuments, shareDocument, uploadDocument, uploadVersion } from "@/lib/settings/vault";
import { connectIntegration, setModuleOn, testIntegration, INTEGRATIONS } from "@/lib/settings/switches";
import { makeSchool, makeUser } from "../helpers";

const PDF = new File([Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF")], "affiliation.pdf", { type: "application/pdf" });
const parts = (link: string) => {
  const u = new URL(link, "http://x");
  return { id: u.pathname.split("/").pop()!, s: u.searchParams.get("s")!, e: u.searchParams.get("e")!, t: u.searchParams.get("t")! };
};

let school: Awaited<ReturnType<typeof makeSchool>>;
let admin: { id: string };
const ctx = () => ({ schoolId: school.id, userId: admin.id });

beforeAll(async () => {
  school = await makeSchool("Files School");
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }] });
});

describe("file links", () => {
  it("work until they expire, and not after", () => {
    const now = Date.now();
    const p = parts(fileLink("11111111-1111-4111-8111-111111111111", school.id, now));
    expect(checkFileLink(p.id, p.s, p.e, p.t, now + 1000)).toEqual({ ok: true });
    expect(checkFileLink(p.id, p.s, p.e, p.t, now + FILE_LINK_MS + 1)).toEqual({ ok: false, reason: "expired" });
    // A changed time or another school breaks the signature.
    expect(checkFileLink(p.id, p.s, String(Number(p.e) + 60_000), p.t, now)).toEqual({ ok: false, reason: "bad" });
    expect(checkFileLink(p.id, "22222222-2222-4222-8222-222222222222", p.e, p.t, now)).toEqual({ ok: false, reason: "bad" });
  });

  it("the file route sends the file with safe headers, and refuses expired or forged links", async () => {
    const doc = await withSchool(ctx(), (tx) => uploadDocument(tx, ctx(), { docType: "Affiliation", title: "CBSE affiliation", issuedOn: null, expiresOn: null, visibleTo: ["school-admin", "principal"], file: PDF }));
    const fileId = (doc.versions as { fileId: string }[])[0].fileId;
    const ok = await GET(new Request(`http://x${fileLink(fileId, school.id)}`), { params: Promise.resolve({ id: fileId }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toBe("application/pdf");
    expect(ok.headers.get("Content-Disposition")).toContain('inline; filename="affiliation.pdf"');
    expect(ok.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect((await ok.text()).startsWith("%PDF-")).toBe(true);

    const old = fileLink(fileId, school.id, Date.now() - FILE_LINK_MS - 5000);
    expect((await GET(new Request(`http://x${old}`), { params: Promise.resolve({ id: fileId }) })).status).toBe(410);
    const forged = fileLink(fileId, school.id).replace(/t=[^&]+/, "t=forged");
    expect((await GET(new Request(`http://x${forged}`), { params: Promise.resolve({ id: fileId }) })).status).toBe(403);
  });

  it("another school's link cannot open this school's file", async () => {
    const other = await makeSchool("Other Files School");
    const doc = await withSchool(ctx(), (tx) => uploadDocument(tx, ctx(), { docType: "NOC", title: "Fire NOC", issuedOn: null, expiresOn: null, visibleTo: ["school-admin"], file: PDF }));
    const fileId = (doc.versions as { fileId: string }[])[0].fileId;
    const res = await GET(new Request(`http://x${fileLink(fileId, other.id)}`), { params: Promise.resolve({ id: fileId }) });
    expect(res.status).toBe(404);
  });
});

describe("the document vault", () => {
  it("keeps versions, shares for 7 days, and reminds once before expiry", async () => {
    const now = new Date("2026-10-09T05:00:00Z");
    const expires = new Date("2026-10-25T00:00:00Z");
    const doc = await withSchool(ctx(), (tx) => uploadDocument(tx, ctx(), { docType: "Fire safety", title: "Fire safety certificate", issuedOn: new Date("2025-10-25T00:00:00Z"), expiresOn: expires, visibleTo: ["school-admin"], file: PDF }));
    expect(expiryState(expires, now)).toBe("soon");
    const principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }] });
    const sent = await withSchool({ schoolId: school.id, userId: null }, (tx) => remindExpiringDocuments(tx, { schoolId: school.id, userId: null }, now));
    expect(sent).toBeGreaterThanOrEqual(1);
    // The principal may not see this document, so is not told about it.
    const notes = await withSchool(ctx(), (tx) => tx.notification.findMany({ where: { type: "document-expiry" } }));
    expect(notes.some((n) => n.userLoginId === admin.id)).toBe(true);
    expect(notes.some((n) => n.userLoginId === principal.id)).toBe(false);
    // Running again sends nothing new.
    expect(await withSchool({ schoolId: school.id, userId: null }, (tx) => remindExpiringDocuments(tx, { schoolId: school.id, userId: null }, now))).toBe(0);

    await expect(withSchool(ctx(), (tx) => uploadVersion(tx, ctx(), ["school-admin"], doc.id, { file: PDF, issuedOn: new Date("2026-10-20T00:00:00Z"), expiresOn: new Date("2026-10-01T00:00:00Z") }))).rejects.toThrow(/after the issue date/);
    const count = await withSchool(ctx(), (tx) => uploadVersion(tx, ctx(), ["school-admin"], doc.id, { file: PDF, issuedOn: new Date("2026-10-20T00:00:00Z"), expiresOn: new Date("2027-10-25T00:00:00Z") }));
    expect(count).toBe(2);
    // Others cannot open it.
    await expect(withSchool(ctx(), (tx) => shareDocument(tx, ctx(), ["principal"], doc.id, 7))).rejects.toThrow(/not found/);
    const t = Date.now();
    const share = await withSchool(ctx(), (tx) => shareDocument(tx, ctx(), ["school-admin"], doc.id, 7, t));
    const p = parts(share.link);
    expect(checkFileLink(p.id, p.s, p.e, p.t, t + 6 * 86_400_000)).toEqual({ ok: true });
    expect(checkFileLink(p.id, p.s, p.e, p.t, t + 8 * 86_400_000)).toEqual({ ok: false, reason: "expired" });
  });
});

describe("School Profile rules", () => {
  it("checks the GSTIN format and check character", () => {
    expect(checkGstin("27AAPFU0939F1ZV")).toBeNull();
    expect(checkGstin("27AAPFU0939F1ZX")).toMatch(/does not match/);
    expect(checkGstin("27AAPFU0939F1Z")).toBe("GSTIN has 14 characters. A GSTIN has 15.");
    expect(checkGstin("99AAPFU0939F1ZV")).not.toBeNull();
  });

  it("choosing CBSE fills the CBSE defaults for the modules", async () => {
    await withSchool(ctx(), (tx) => saveBoard(tx, ctx(), { board: "CBSE", secondBoard: null }));
    const s = await withSchool(ctx(), (tx) => tx.school.findUniqueOrThrow({ where: { id: school.id } }));
    expect(s.board).toBe("CBSE");
    expect((s.preferences as { boardDefaults: unknown }).boardDefaults).toEqual({ terms: ["Term 1", "Term 2"], gradeScale: "CBSE 9-point grade scale", reportCard: "CBSE report card" });
  });

  it("campuses: the main campus cannot be archived; another can", async () => {
    await expect(withSchool(ctx(), (tx) => archiveCampus(tx, ctx(), school.campus.id))).rejects.toThrow(/main campus/);
    const north = await withSchool(ctx(), (tx) => addCampus(tx, ctx(), { name: "North Campus", address: "Kompally", phone: null, headName: "Anil Das" }));
    await withSchool(ctx(), (tx) => makeMainCampus(tx, ctx(), north.id));
    await withSchool(ctx(), (tx) => archiveCampus(tx, ctx(), school.campus.id));
    await expect(withSchool(ctx(), (tx) => addCampus(tx, ctx(), { name: "north campus", address: null, phone: null, headName: null }))).rejects.toThrow(/already a campus/);
  });
});

describe("Modules On/Off", () => {
  it("only optional modules switch, and only once they are built", async () => {
    await expect(withSchool(ctx(), (tx) => setModuleOn(tx, ctx(), "fee-management", false))).rejects.toThrow(/always on/);
    await expect(withSchool(ctx(), (tx) => setModuleOn(tx, ctx(), "transport-management", true))).rejects.toThrow(/arrives in Stage 4/);
  });

  it("integrations: checks details, keeps secrets encrypted, reports health in plain words", async () => {
    const webhook = INTEGRATIONS.find((i) => i.key === "webhooks")!;
    expect((await testIntegration(webhook, { address: "http://example.com", secret: "s" }, async () => ({ status: 200 }))).note).toMatch(/https/);
    const ok = await withSchool(ctx(), (tx) => connectIntegration(tx, ctx(), "webhooks", { address: "https://example.com/hook", secret: "top-secret-value" }, async () => ({ status: 200 })));
    expect(ok.ok).toBe(true);
    const row = await withSchool(ctx(), (tx) => tx.integration.findUniqueOrThrow({ where: { schoolId_key: { schoolId: school.id, key: "webhooks" } } }));
    expect(row.status).toBe("connected");
    expect(row.secretsEnc).not.toContain("top-secret-value");
    expect(JSON.stringify(row.config)).not.toContain("top-secret-value");
    const down = await withSchool(ctx(), (tx) => connectIntegration(tx, ctx(), "webhooks", { address: "https://example.com/hook", secret: "" }, async () => { throw new Error("offline"); }));
    expect(down.ok).toBe(false);
    expect(down.note).toMatch(/could not reach/);
  });
});
