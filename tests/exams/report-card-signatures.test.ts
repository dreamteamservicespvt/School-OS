// A printed report card has places to sign for the class teacher, the
// Principal and the parent, and the day it was issued (QA LC7, 08 "Report
// card contents").
import { describe, expect, it } from "vitest";
import { defaultOptions } from "@/lib/documents/designs";
import { renderHtml, sampleData } from "@/lib/documents/render";
import { findDocType } from "@/lib/documents/types";
import { reportSignLines } from "@/lib/exams/report-cards";

const branding = { name: "Sunrise Public School", address: "Hyderabad", phone: "040 1234", email: null, website: null, affiliationNumber: null, board: "CBSE", code: "SPS", gstin: null, brandColor: null, campusName: null, campusAddress: null, academicYear: "2026-27", timeZone: "Asia/Kolkata" };

describe("report card signatures and issue date", () => {
  it("has blank lines for the class teacher, the Principal and the parent; no Principal line when a signatory prints", () => {
    expect(reportSignLines(false)).toEqual(["Class teacher", "Principal", "Parent"]);
    expect(reportSignLines(true)).toEqual(["Class teacher", "Parent"]);
  });

  it("prints the lines and Issued on <date> in every ready design", () => {
    const t = findDocType("report-card")!;
    for (const base of ["classic", "modern", "cbse"] as const) {
      const html = renderHtml({ type: t, base, options: defaultOptions(t), branding, signatories: [], assets: { logo: null, background: null, images: new Map() }, records: [{ ...sampleData(t), signLines: reportSignLines(false), issuedOn: "12-11-2026" }] });
      for (const who of ["Class teacher", "Principal", "Parent"]) expect(html).toContain(`<div class="sigline">${who}</div>`);
      expect(html).toContain("Issued on 12-11-2026");
    }
  });
});
