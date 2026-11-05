// Add Staff step 3 (owner test 2026-11-05): "Class teacher of" is one choice, apart
// from the subjects taught, and offered by the roles chosen in step 2.
import { describe, expect, it } from "vitest";
import { classTeacherRefusal, freePairs, stepThree, stepThreeSummary } from "@/lib/staff/class-picks";

describe("what step 3 offers", () => {
  it("a Class Teacher login: class teacher of one section, and subjects", () => {
    expect(stepThree({ teachingPost: true, giveLogin: true, roleKeys: ["class-teacher"] })).toEqual({ classTeacher: true, subjects: true, notes: [] });
  });

  it("a Teacher login: subjects only, and says how to make them a class teacher", () => {
    const s = stepThree({ teachingPost: true, giveLogin: true, roleKeys: ["teacher"] });
    expect(s).toMatchObject({ classTeacher: false, subjects: true });
    expect(s.notes.join(" ")).toMatch(/tick the Class Teacher role in step 2/);
  });

  it("no login: subjects only (the class teacher takes the daily attendance, so needs a login)", () => {
    const s = stepThree({ teachingPost: true, giveLogin: false, roleKeys: [] });
    expect(s).toMatchObject({ classTeacher: false, subjects: true });
    expect(s.notes.join(" ")).toMatch(/needs a login with the Class Teacher role/);
  });

  it("roles that do not teach: no subjects; a role the school made may teach", () => {
    expect(stepThree({ teachingPost: true, giveLogin: true, roleKeys: ["accountant"] })).toMatchObject({ classTeacher: false, subjects: false });
    expect(stepThree({ teachingPost: true, giveLogin: true, roleKeys: ["my-own-role"] })).toMatchObject({ subjects: true });
    expect(stepThree({ teachingPost: false, giveLogin: true, roleKeys: ["class-teacher"] })).toMatchObject({ classTeacher: false, subjects: false });
  });
});

describe("the subjects taught", () => {
  const taken = { classTeacher: { s2: "Ravi Teja" }, subject: { "s1:eng": "Meera Pillai" } };
  it("leaves out a subject and section someone else teaches", () => {
    expect(freePairs(["s1:eng", "s1:mat", "s2:mat", "s1:mat"], taken)).toEqual(["s1:mat", "s2:mat"]);
  });

  it("says plainly what was chosen", () => {
    expect(stepThreeSummary({ classTeacherOf: "Class 1 A", pairs: ["s1:mat", "s2:mat", "s2:eng"] }))
      .toBe("Class teacher of Class 1 A. Teaches 3 subjects across 2 sections (one per subject and section).");
    expect(stepThreeSummary({ classTeacherOf: null, pairs: ["s2:mat"] })).toBe("Not a class teacher. Teaches 1 subject across 1 section (one per subject and section).");
    expect(stepThreeSummary({ classTeacherOf: null, pairs: [] })).toBe("Not a class teacher. No subjects chosen yet.");
  });
});

describe("the server's check of the class-teacher section", () => {
  it("needs the Class Teacher role and a section with no class teacher yet", () => {
    expect(classTeacherRefusal({ giveLogin: true, roleKeys: ["class-teacher"], sectionLabel: "Class 2 A", currentTeacher: null })).toBeNull();
    expect(classTeacherRefusal({ giveLogin: true, roleKeys: ["teacher"], sectionLabel: "Class 2 A", currentTeacher: null })).toMatch(/Class Teacher role/);
    expect(classTeacherRefusal({ giveLogin: false, roleKeys: [], sectionLabel: "Class 2 A", currentTeacher: null })).toMatch(/needs a login/);
    expect(classTeacherRefusal({ giveLogin: true, roleKeys: ["class-teacher"], sectionLabel: "Class 2 A", currentTeacher: "Ravi Teja" })).toBe("Step 3: Class 2 A already has a class teacher, Ravi Teja. Choose another section, or change it in Academic Management, Classes & Sections.");
  });
});
