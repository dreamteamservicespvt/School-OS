// The top search box finds every page inside a module (team test 13-11:
// a Receptionist searched "Postal" and got no result).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript build script
import { buildIndex, OUT } from "../scripts/gen-page-index.mjs";
import { PAGE_INDEX } from "../src/lib/page-index";

describe("page index for search", () => {
  it("is up to date with the pages (run: node scripts/gen-page-index.mjs)", () => {
    expect(readFileSync(OUT, "utf8").replace(/\r\n/g, "\n")).toBe(buildIndex());
  });

  it("has the Front Office pages a Receptionist looks for", () => {
    const titles = PAGE_INDEX.filter((p) => p.module === "front-office").map((p) => p.title);
    expect(titles).toEqual(expect.arrayContaining(["Postal & Deliveries", "Student Pickup", "Enquiries & Calls", "Appointments"]));
  });

  it("has inner pages of every big module", () => {
    for (const m of ["fee-management", "library-management", "hostel-management", "staff-hr-management", "student-management", "settings"]) {
      expect(PAGE_INDEX.some((p) => p.module === m), m).toBe(true);
    }
  });
});
