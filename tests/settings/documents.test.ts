// Settings, Document Designs: every document renders with the school's
// design, merge fields are filled and escaped, versions are kept, and the
// preview prints to PDF.
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { renderDocument } from "@/lib/documents";
import { currentDesign, defaultOptions, saveDesign, restoreVersion } from "@/lib/documents/designs";
import { mergeText, renderHtml, sampleData } from "@/lib/documents/render";
import { DOC_TYPES, findDocType } from "@/lib/documents/types";
import { makeQr } from "@/lib/documents/qr";
import { code128B } from "@/lib/documents/barcode";
import { numberInWords, rupeesInWords } from "@/lib/documents/words";
import { makeSchool, makeUser } from "../helpers";

let school: Awaited<ReturnType<typeof makeSchool>>;
let ctx: { schoolId: string; userId: string };

beforeAll(async () => {
  school = await makeSchool("Design School");
  const admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }] });
  ctx = { schoolId: school.id, userId: admin.id };
});

const branding = { name: "Sunrise <Public> School", address: "Hyderabad", phone: "040 1234", email: null, website: null, affiliationNumber: "3630123", board: "CBSE", code: "SPS", gstin: null, brandColor: null, campusName: null, campusAddress: null, academicYear: "2026-27", timeZone: "Asia/Kolkata" };

describe("rendering", () => {
  it("renders every document type with sample data in every ready design", () => {
    for (const t of DOC_TYPES) {
      for (const base of ["classic", "modern", "cbse"]) {
        const html = renderHtml({ type: t, base, options: defaultOptions(t), branding, signatories: [{ name: "Lakshmi Rao", title: "Principal", image: null }], assets: { logo: null, background: null, images: new Map() }, records: [sampleData(t)] });
        expect(html).toContain("Sunrise &lt;Public&gt; School");
        expect(html).not.toContain("{{");
        if (t.family !== "card") expect(html).toContain("Lakshmi Rao");
      }
    }
  });

  it("fills merge fields, escapes them, and writes he/she from gender", () => {
    const values = { student_name: "<b>Aarav</b>", he_she: "he", class_section: "Class 5 A" };
    expect(mergeText("{{he_she}} studies in {{class_section}}. {{student_name}}", values)).toBe("He studies in Class 5 A. &lt;b&gt;Aarav&lt;/b&gt;");
    const t = findDocType("bonafide-certificate")!;
    const html = renderHtml({ type: t, base: "classic", options: defaultOptions(t), branding, signatories: [], assets: { logo: null, background: null, images: new Map() }, records: [{ fields: { ...sampleData(t).fields, gender: "Female", son_daughter: "", his_her: "", he_she: "" } }] });
    expect(html).toContain("daughter of Rajesh Sharma");
    expect(html).toContain("She was admitted");
  });

  it("totals money lines and writes the amount in words", () => {
    const t = findDocType("fee-receipt")!;
    const html = renderHtml({ type: t, base: "modern", options: defaultOptions(t), branding, signatories: [], assets: { logo: null, background: null, images: new Map() }, records: [{ fields: { receipt_no: "R/1" }, lines: [{ label: "Tuition", amountPaise: 1850000n }, { label: "Lab", amountPaise: 150050 }] }] });
    expect(html).toContain("₹20,000.50");
    expect(html).toContain("Rupees Twenty Thousand and Fifty Paise Only");
    const slip = findDocType("salary-slip")!;
    const s = renderHtml({ type: slip, base: "classic", options: defaultOptions(slip), branding, signatories: [], assets: { logo: null, background: null, images: new Map() }, records: [sampleData(slip)] });
    expect(s).toContain("Net pay");
    expect(s).toContain("₹46,000");
  });

  it("writes amounts the Indian way", () => {
    expect(numberInWords(1234567)).toBe("Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven");
    expect(numberInWords(25_00_00_000)).toBe("Twenty Five Crore");
    expect(rupeesInWords(100)).toBe("Rupees One Only");
  });
});

describe("codes on documents", () => {
  it("makes QR codes identical to a reference encoder", () => {
    // Reference hashes from the python "qrcode" package (version, level M, mask fixed).
    const hash = (rows: boolean[][]) => createHash("sha256").update(rows.map((r) => r.map((c) => (c ? "1" : "0")).join("")).join("\n")).digest("hex");
    const a = makeQr("https://school.example/v/SPS-2026-00123", 3);
    expect(a.version).toBe(3);
    expect(hash(a.modules)).toBe("19fe610852367d6e57594dff1fbba12de91dadaefd26f108acff91a98e717ad0");
    const b = makeQr("x".repeat(200), 6);
    expect(b.version).toBe(10);
    expect(hash(b.modules)).toBe("3db312672d9837828c20947cb7d0be7e769f5ef7bfebdea5b0d6897f2f45d3f9");
  });

  it("makes Code 128 barcodes with the right check symbol", () => {
    expect(code128B("LIB-ABC-xyz")).toBe("110100100001000110111011000100010100010110001001101110010100011000100010110001000100011010011011100111100100101101101111011011110110100100001101100011101011");
    expect(() => code128B("नमस्ते")).toThrow();
  });
});

describe("saved designs", () => {
  it("uses the ready Classic design until the school saves one", async () => {
    const d = await withSchool(ctx, (tx) => currentDesign(tx, "fee-receipt"));
    expect(d.version).toBe(0);
    expect(d.base).toBe("classic");
  });

  it("keeps every version, and using an old one makes a new version", async () => {
    const t = findDocType("bonafide-certificate")!;
    const o = defaultOptions(t);
    await withSchool(ctx, (tx) => saveDesign(tx, ctx, t.key, "classic", { ...o, title: "Bonafide One" }));
    await withSchool(ctx, (tx) => saveDesign(tx, ctx, t.key, "modern", { ...o, title: "Bonafide Two" }));
    expect((await withSchool(ctx, (tx) => currentDesign(tx, t.key))).options.title).toBe("Bonafide Two");
    const back = await withSchool(ctx, (tx) => restoreVersion(tx, ctx, t.key, 1));
    expect(back.version).toBe(3);
    const now = await withSchool(ctx, (tx) => currentDesign(tx, t.key));
    expect(now.options.title).toBe("Bonafide One");
    expect(now.base).toBe("classic");
    const rows = await withSchool(ctx, (tx) => tx.documentDesign.findMany({ where: { docType: t.key } }));
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.isCurrent)).toHaveLength(1);
    const audit = await withSchool(ctx, (tx) => tx.auditLogEntry.findMany({ where: { recordType: "Document Design" } }));
    expect(audit.length).toBeGreaterThanOrEqual(3);
  });

  it("refuses unknown merge fields in plain words", async () => {
    const t = findDocType("study-certificate")!;
    await expect(withSchool(ctx, (tx) => saveDesign(tx, ctx, t.key, "classic", { ...defaultOptions(t), body: "Hello {{salary}}" }))).rejects.toThrow(/not known for a study certificate: salary/);
  });

  it("renders with the school's saved design and branding through renderDocument", async () => {
    const t = findDocType("fee-receipt")!;
    await withSchool(ctx, (tx) => saveDesign(tx, ctx, t.key, "modern", { ...defaultOptions(t), title: "Money Received", accent: "#0F766E" }));
    const doc = await withSchool(ctx, (tx) => renderDocument(tx, ctx, "fee-receipt", { fields: { receipt_no: "DS/1", student_name: "Asha" }, lines: [{ label: "Tuition", amountPaise: 500000 }] }));
    expect(doc.html).toContain("Money Received");
    expect(doc.html).toContain("#0F766E");
    expect(doc.html).toContain("Design School");
  });

  it.skipIf(!process.env.CHROMIUM_PATH)("prints the preview to a PDF", async () => {
    const doc = await withSchool(ctx, (tx) => renderDocument(tx, ctx, "student-id-card", [sampleData(findDocType("student-id-card")!), sampleData(findDocType("student-id-card")!)]));
    const pdf = await doc.pdf();
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  }, 60_000);
});
