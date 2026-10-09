// Academic years (04 §5, §9 Done when 2 and 10): one active year per campus,
// closed years read-only, a new year copies without touching the old one,
// removing a year made by mistake only while nothing is recorded, terms.
import { beforeAll, describe, expect, it } from "vitest";
import { ClosedYearError, assertYearWritable } from "@/lib/academic/years";
import { closeYear, createYear, openYear, openYearPreview, removeCheck, removeYear, checkTerm } from "@/lib/academic/lifecycle";
import { academicSchool, d } from "./fixture";

let s: Awaited<ReturnType<typeof academicSchool>>;
beforeAll(async () => { s = await academicSchool(); });

describe("one active year per campus", () => {
  it("opening a new year makes it the only active one, and says so first", async () => {
    const { year } = await s.run((tx) => createYear(tx, s.ctx, { campusId: s.campusId, name: "2027-28", startDate: d("2027-04-01"), endDate: d("2028-03-31"), termPreset: "two-terms" }));
    const preview = await s.run((tx) => openYearPreview(tx, year.id));
    expect(preview.message).toBe("2026-27 is active. Opening 2027-28 makes it the active year from 01-04-2027.");
    await s.run((tx) => openYear(tx, s.ctx, year.id, "keep"));
    const years = await s.run((tx) => tx.academicYear.findMany({ where: { campusId: s.campusId, archivedAt: null } }));
    expect(years.filter((y) => y.status === "ACTIVE").map((y) => y.name)).toEqual(["2027-28"]);
    expect(years.find((y) => y.name === "2026-27")?.status).toBe("OPEN");
    // Put things back for the other tests.
    await s.run((tx) => openYear(tx, s.ctx, s.year.id, "keep"));
  });

  it("the database refuses a second active year on the same campus", async () => {
    await expect(s.run((tx) => tx.academicYear.create({ data: { schoolId: s.school.id, campusId: s.campusId, name: "Duplicate", startDate: d("2030-04-01"), endDate: d("2031-03-31"), status: "ACTIVE" } }))).rejects.toThrow();
  });

  it("years cannot overlap", async () => {
    await expect(s.run((tx) => createYear(tx, s.ctx, { campusId: s.campusId, name: "Wrong", startDate: d("2026-12-01"), endDate: d("2027-11-30") }))).rejects.toThrow(/overlap 2026-27/);
  });
});

describe("starting a new year copies without overwriting", () => {
  it("copies classes, sections and allocations into new records and leaves the old year as it was", async () => {
    const before = await s.run((tx) => tx.section.findMany({ where: { academicYearId: s.year.id }, orderBy: { id: "asc" } }));
    const r = await s.run((tx) => createYear(tx, s.ctx, { campusId: s.campusId, name: "2028-29", startDate: d("2028-04-01"), endDate: d("2029-03-31"), copyFromYearId: s.year.id }));
    expect(r.message).toBe("Copied 2 classes, 3 sections, 9 allocations into 2028-29.");
    const after = await s.run((tx) => tx.section.findMany({ where: { academicYearId: s.year.id }, orderBy: { id: "asc" } }));
    expect(after).toEqual(before);
    const copied = await s.run((tx) => tx.section.findMany({ where: { academicYearId: r.year.id } }));
    expect(copied).toHaveLength(3);
    expect(copied.some((c) => before.some((b) => b.id === c.id))).toBe(false);
  });
});

describe("removing a year made by mistake", () => {
  it("is offered while nothing is recorded, then removes its sections and terms", async () => {
    const { year } = await s.run((tx) => createYear(tx, s.ctx, { campusId: s.campusId, name: "2031-32", startDate: d("2031-04-01"), endDate: d("2032-03-31"), copyFromYearId: s.year.id }));
    const check = await s.run((tx) => removeCheck(tx, year.id));
    expect(check.canRemove).toBe(true);
    expect(check.message).toBe("Remove 2031-32? Nothing has been recorded in it yet. Its classes, sections and terms will be removed too.");
    await s.run((tx) => removeYear(tx, s.ctx, year.id));
    expect(await s.run((tx) => tx.section.count({ where: { academicYearId: year.id, archivedAt: null } }))).toBe(0);
    expect(await s.run((tx) => tx.academicYear.findFirst({ where: { id: year.id, archivedAt: null } }))).toBeNull();
  });

  it("is refused once anything is recorded in the year: then it can only be closed", async () => {
    const { year } = await s.run((tx) => createYear(tx, s.ctx, { campusId: s.campusId, name: "2033-34", startDate: d("2033-04-01"), endDate: d("2034-03-31"), copyFromYearId: s.year.id }));
    await s.run(async (tx) => {
      const section = await tx.section.findFirstOrThrow({ where: { academicYearId: year.id } });
      const item = await tx.syllabusItem.create({ data: { schoolId: s.school.id, academicYearId: year.id, classId: section.classId, subjectId: s.subjects.MAT, kind: "TOPIC", title: "Place value" } });
      await tx.syllabusProgressEntry.create({ data: { schoolId: s.school.id, academicYearId: year.id, sectionId: section.id, itemId: item.id, date: d("2033-06-10"), status: "taught" } });
    });
    const check = await s.run((tx) => removeCheck(tx, year.id));
    expect(check.canRemove).toBe(false);
    expect(check.message).toMatch(/already recorded in 2033-34, so it cannot be removed. You can close it./);
    await expect(s.run((tx) => removeYear(tx, s.ctx, year.id))).rejects.toThrow(/cannot be removed/);
  });
});

describe("closed years are read-only", () => {
  it("refuses changes, except an authorised correction with a reason", async () => {
    const { year } = await s.run((tx) => createYear(tx, s.ctx, { campusId: s.campusId, name: "2035-36", startDate: d("2035-04-01"), endDate: d("2036-03-31") }));
    await s.run((tx) => closeYear(tx, s.ctx, year.id));
    await expect(s.run((tx) => assertYearWritable(tx, year.id))).rejects.toThrow(ClosedYearError);
    await expect(s.run((tx) => assertYearWritable(tx, year.id))).rejects.toThrow("2035-36 is closed. Use Make a correction.");
    const note = await s.run((tx) => assertYearWritable(tx, year.id, "Fixing a wrong section name"));
    expect(note).toMatch(/Fixing a wrong section name/);
    await expect(s.run((tx) => openYear(tx, s.ctx, year.id, "keep"))).rejects.toThrow(/cannot be opened again/);
  });
});

describe("terms", () => {
  it("cannot overlap, must sit inside the year, and gaps are only a warning", async () => {
    await s.run((tx) => tx.term.create({ data: { schoolId: s.school.id, academicYearId: s.year.id, name: "Term 1", startDate: d("2026-04-01"), endDate: d("2026-09-30") } }));
    await expect(s.run((tx) => checkTerm(tx, { academicYearId: s.year.id, name: "Term 2", startDate: d("2026-09-15"), endDate: d("2027-03-31") }))).rejects.toThrow("Term 2 starts before Term 1 ends (30-09-2026).");
    await expect(s.run((tx) => checkTerm(tx, { academicYearId: s.year.id, name: "Term 2", startDate: d("2026-10-01"), endDate: d("2027-04-30") }))).rejects.toThrow(/must sit inside 2026-27/);
    const ok = await s.run((tx) => checkTerm(tx, { academicYearId: s.year.id, name: "Term 2", startDate: d("2026-10-10"), endDate: d("2027-03-31") }));
    expect(ok.warning).toBe("01-10-2026 to 09-10-2026 is in no term.");
  });
});
