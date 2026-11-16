// The year a new enquiry is for (layman loop 6, L6-04): from about October, parents ask for next
// June, so the next year is the default once it exists, even before its sections are made; the
// year the school chose in Admission Settings always wins.
import { describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { enquiryYear } from "@/lib/admission/settings";
import { admissionSchool, day } from "./fixtures";

describe("the year a new enquiry is for", () => {
  it("is the next year from about 8 months before it starts, else this year; the school's own choice wins", async () => {
    const s = await admissionSchool("Enquiry Year School");
    const ctx = { schoolId: s.school.id, userId: null };
    await withSchool(ctx, async (tx) => {
      // The next year without sections (the fixture gives it sections: take them away for this test).
      await tx.section.updateMany({ where: { academicYearId: s.nextYearId }, data: { archivedAt: new Date() } });
      const none = { admissionYearId: null };
      expect((await enquiryYear(tx, ctx, none, s.campusId, day("2026-06-15")))?.id).toBe(s.yearId);
      expect((await enquiryYear(tx, ctx, none, s.campusId, day("2026-11-16")))?.id).toBe(s.nextYearId);
      // The school set this year as the admission year: enquiries stay in it.
      expect((await enquiryYear(tx, ctx, { admissionYearId: s.yearId }, s.campusId, day("2026-11-16")))?.id).toBe(s.yearId);
    });
  });
});
