// Fixes from the Chaitanya EM School QA audit (campus area): a typed amount
// has an upper limit, and an accession number problem names the form's own
// field ("accessions"), so the sheet shows it next to the box.
import { beforeAll, describe, expect, it } from "vitest";
import { money, LibraryProblem } from "@/lib/library/act";
import { addTestBook, makeLibrarySchool, type LibFixture } from "./fixture";

const fd = (v: Record<string, string>) => { const f = new FormData(); for (const [k, x] of Object.entries(v)) f.set(k, x); return f; };

describe("library amounts", () => {
  it("refuse an amount nobody would charge", () => {
    expect(() => money(fd({ price: "99999999999" }), "price", "Price")).toThrow(/looks too large/);
    expect(money(fd({ price: "1,00,00,000" }), "price", "Price")).toBe(BigInt(10_000_000_00));
    expect(money(fd({ price: "250.50" }), "price", "Price")).toBe(BigInt(25050));
  });
});

describe("accession numbers", () => {
  let f: LibFixture;
  beforeAll(async () => { f = await makeLibrarySchool("Library QA Campus School"); }, 120_000);

  it("name the accessions box when typed twice, already used or the wrong count", async () => {
    const field = async (p: Promise<unknown>) => { try { await p; return "saved"; } catch (e) { return e instanceof LibraryProblem ? e.field : String(e); } };
    await addTestBook(f, "Demo First", 1, { accessions: ["QA-1"] });
    expect(await field(addTestBook(f, "Demo Twice", 2, { accessions: ["QA-2", "QA-2"] }))).toBe("accessions");
    expect(await field(addTestBook(f, "Demo Used", 1, { accessions: ["QA-1"] }))).toBe("accessions");
    expect(await field(addTestBook(f, "Demo Count", 2, { accessions: ["QA-3"] }))).toBe("accessions");
  });
});
